import Redis, { Redis as RedisClient } from "ioredis";
import { getConfig } from "../config";

let _client: RedisClient | null = null;
let _isAvailable = true;

export function isRedisAvailable(): boolean {
  return _isAvailable;
}

export function setRedisAvailable(available: boolean): void {
  _isAvailable = available;
  if (!available) {
    console.warn("[redis] Connection lost — Redis unavailable");
  } else {
    console.info("[redis] Connection restored");
  }
}

export function createRedisClient(opts?: { lazyConnect?: boolean }): RedisClient {
  const config = getConfig();
  const client = new Redis(config.redisUrl, {
    lazyConnect: opts?.lazyConnect ?? false,
    maxRetriesPerRequest: 2,
    retryStrategy(times) {
      if (times > 5) {
        setRedisAvailable(false);
        return null; // stop retrying
      }
      return Math.min(times * 200, 2000);
    },
    enableOfflineQueue: false,
    keepAlive: 10000,
    connectTimeout: 5000,
  });

  client.on("connect", () => {
    setRedisAvailable(true);
  });

  client.on("error", (err: any) => {
    if (err?.code === "ECONNREFUSED" || err?.code === "ENOTFOUND") {
      setRedisAvailable(false);
    }
  });

  client.on("close", () => {
    setRedisAvailable(false);
  });

  return client;
}

export function getRedisClient(): RedisClient {
  if (!_client) {
    _client = createRedisClient({ lazyConnect: true });
  }
  return _client;
}

export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}

const LUA_SCRIPT_CACHE = new Map<string, string>();

export async function loadLuaScript(scriptName: string): Promise<string> {
  const scriptPath = `${__dirname}/../../lua/${scriptName}.lua`;
  const fs = await import("fs/promises");
  const script = await fs.readFile(scriptPath, "utf-8");
  LUA_SCRIPT_CACHE.set(scriptName, script);
  return script;
}

export async function evalsha(sha: string, keys: string[], args: (string | number)[]): Promise<any> {
  const redis = getRedisClient();
  const strArgs = args.map((a) => String(a));
  try {
    return await redis.evalsha(sha, keys.length, ...keys, ...strArgs);
  } catch (err: any) {
    if (err && err.message && err.message.includes("NOSCRIPT")) {
      const script = LUA_SCRIPT_CACHE.get(sha);
      if (script) {
        return await redis.eval(script, keys.length, ...keys, ...strArgs);
      }
      throw err;
    }
    throw err;
  }
}

export async function loadAndRegisterScripts(): Promise<Map<string, string>> {
  const redis = getRedisClient();
  const scripts = ["token_bucket", "sliding_window_log"];
  const shaMap = new Map<string, string>();

  for (const name of scripts) {
    const script = await loadLuaScript(name);
    const sha = await (redis as any).script("load", script);
    shaMap.set(name, sha as string);
  }

  return shaMap;
}
