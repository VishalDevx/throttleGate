import { getConfig, updateConfig, GatewayConfig } from "./index";
import { GatewayConfigSchema } from "./schema";
import { createRedisClient } from "../services/redis";

const CONFIG_REDIS_KEY = "throttlegate:config";

export async function hotReloadConfig(): Promise<void> {
  const redis = createRedisClient({ lazyConnect: true });
  try {
    await redis.connect();
    const raw = await redis.get(CONFIG_REDIS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const validated = GatewayConfigSchema.partial().parse(parsed);
      updateConfig(validated as Partial<GatewayConfig>);
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error("[hot-reload] Invalid JSON in config store");
    }
  } finally {
    try { await redis.quit(); } catch { /* ignore */ }
  }
}

export async function pushConfigToRedis(config: GatewayConfig): Promise<void> {
  const redis = createRedisClient({ lazyConnect: true });
  try {
    await redis.connect();
    await redis.set(CONFIG_REDIS_KEY, JSON.stringify(config));
  } finally {
    try { await redis.quit(); } catch { /* ignore */ }
  }
}
