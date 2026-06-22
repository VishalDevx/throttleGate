import { serviceRegistry, ServiceInstance } from "./service-registry";
import { getConfig } from "../config";
import * as http from "http";
import * as https from "https";

interface HealthCheckConfig {
  interval: number;
  timeout: number;
  path: string;
  healthyThreshold: number;
  unhealthyThreshold: number;
}

export class HealthChecker {
  private timers = new Map<string, ReturnType<typeof setInterval>>();
  private consecutiveFailures = new Map<string, number>();
  private consecutiveSuccesses = new Map<string, number>();

  start(): void {
    const config = getConfig();
    for (const upstream of config.upstreams) {
      this.startChecking(upstream.id, upstream.url, upstream.healthCheck);
    }

    // Also check dynamically registered services
    serviceRegistry.on("instance:registered", (instance: ServiceInstance) => {
      const healthCheckConfig: HealthCheckConfig = {
        interval: 10000,
        timeout: 3000,
        path: "/health",
        healthyThreshold: 2,
        unhealthyThreshold: 3,
      };
      this.startChecking(instance.id, instance.url, healthCheckConfig);
    });

    serviceRegistry.on("instance:deregistered", (instance: ServiceInstance) => {
      this.stopChecking(instance.id);
    });
  }

  stop(): void {
    this.timers.forEach((timer) => clearInterval(timer));
    this.timers.clear();
  }

  startChecking(instanceId: string, url: string, config: HealthCheckConfig): void {
    this.stopChecking(instanceId);

    const timer = setInterval(async () => {
      await this.check(instanceId, url, config);
    }, config.interval);
    timer.unref();
    this.timers.set(instanceId, timer);
  }

  stopChecking(instanceId: string): void {
    const timer = this.timers.get(instanceId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(instanceId);
    }
  }

  private async check(instanceId: string, url: string, config: HealthCheckConfig): Promise<void> {
    // Find which service this instance belongs to
    const allInstances = serviceRegistry.getAllInstances();
    const instance = allInstances.find((i) => i.id === instanceId);
    if (!instance) return;

    const isHttps = url.startsWith("https");
    const proto = isHttps ? https : http;
    const urlObj = new URL(url);

    return new Promise<void>((resolve) => {
      const req = proto.request(
        {
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: config.path,
          method: "GET",
          timeout: config.timeout,
        },
        (res) => {
          const healthy = res.statusCode! >= 200 && res.statusCode! < 400;
          this.recordResult(instanceId, instance.serviceName, healthy, config);
          resolve();
        }
      );

      req.on("error", () => {
        this.recordResult(instanceId, instance.serviceName, false, config);
        resolve();
      });

      req.on("timeout", () => {
        req.destroy();
        this.recordResult(instanceId, instance.serviceName, false, config);
        resolve();
      });

      req.end();
    });
  }

  private recordResult(instanceId: string, serviceName: string, healthy: boolean, config: HealthCheckConfig): void {
    if (healthy) {
      const failures = (this.consecutiveFailures.get(instanceId) ?? 0);
      this.consecutiveFailures.set(instanceId, 0);
      const successes = (this.consecutiveSuccesses.get(instanceId) ?? 0) + 1;
      this.consecutiveSuccesses.set(instanceId, successes);

      if (successes >= config.healthyThreshold) {
        serviceRegistry.markHealthy(serviceName, instanceId);
      }
    } else {
      const successes = (this.consecutiveSuccesses.get(instanceId) ?? 0);
      this.consecutiveSuccesses.set(instanceId, 0);
      const failures = (this.consecutiveFailures.get(instanceId) ?? 0) + 1;
      this.consecutiveFailures.set(instanceId, failures);

      if (failures >= config.unhealthyThreshold) {
        serviceRegistry.markUnhealthy(serviceName, instanceId);
      }
    }
  }

  // Passive health check: called when a real request fails
  recordPassiveFailure(instanceId: string, serviceName: string): void {
    // Immediately mark as unhealthy on passive detection
    serviceRegistry.markUnhealthy(serviceName, instanceId);
  }

  recordPassiveSuccess(instanceId: string, serviceName: string): void {
    serviceRegistry.markHealthy(serviceName, instanceId);
  }
}

export const healthChecker = new HealthChecker();
