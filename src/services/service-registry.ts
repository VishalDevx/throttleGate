import { EventEmitter } from "events";

export interface ServiceInstance {
  id: string;
  serviceName: string;
  url: string;
  host: string;
  port: number;
  healthy: boolean;
  weight: number;
  registeredAt: number;
  lastHeartbeat: number;
  activeConnections: number;
  maxConnections: number;
  metadata: Record<string, string>;
}

interface ServiceEntry {
  instances: ServiceInstance[];
}

export class ServiceRegistry extends EventEmitter {
  private services = new Map<string, ServiceEntry>();

  register(instance: Omit<ServiceInstance, "registeredAt" | "lastHeartbeat" | "healthy">): ServiceInstance {
    const existing = this.services.get(instance.serviceName);
    if (existing) {
      const dup = existing.instances.find((i) => i.id === instance.id);
      if (dup) {
        Object.assign(dup, { ...instance, registeredAt: dup.registeredAt, lastHeartbeat: Date.now(), healthy: dup.healthy });
        this.emit("instance:updated", dup);
        return dup;
      }
    }

    const full: ServiceInstance = {
      ...instance,
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      healthy: true,
    };

    if (!this.services.has(instance.serviceName)) {
      this.services.set(instance.serviceName, { instances: [] });
    }

    this.services.get(instance.serviceName)!.instances.push(full);
    this.emit("instance:registered", full);
    return full;
  }

  deregister(serviceName: string, instanceId: string): boolean {
    const entry = this.services.get(serviceName);
    if (!entry) return false;

    const idx = entry.instances.findIndex((i) => i.id === instanceId);
    if (idx === -1) return false;

    const removed = entry.instances.splice(idx, 1)[0]!;
    if (entry.instances.length === 0) {
      this.services.delete(serviceName);
    }

    this.emit("instance:deregistered", removed);
    return true;
  }

  getInstances(serviceName: string): ServiceInstance[] {
    const entry = this.services.get(serviceName);
    if (!entry) return [];
    return entry.instances.filter((i) => i.healthy);
  }

  getAllInstances(): ServiceInstance[] {
    const all: ServiceInstance[] = [];
    this.services.forEach((entry) => {
      all.push(...entry.instances);
    });
    return all;
  }

  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  markHealthy(serviceName: string, instanceId: string): void {
    const instance = this.findInstance(serviceName, instanceId);
    if (instance) {
      instance.healthy = true;
      instance.lastHeartbeat = Date.now();
      this.emit("instance:healthy", instance);
    }
  }

  markUnhealthy(serviceName: string, instanceId: string): void {
    const instance = this.findInstance(serviceName, instanceId);
    if (instance) {
      instance.healthy = false;
      this.emit("instance:unhealthy", instance);
    }
  }

  updateHeartbeat(serviceName: string, instanceId: string): void {
    const instance = this.findInstance(serviceName, instanceId);
    if (instance) {
      instance.lastHeartbeat = Date.now();
    }
  }

  incrementConnections(serviceName: string, instanceId: string): void {
    const instance = this.findInstance(serviceName, instanceId);
    if (instance) instance.activeConnections++;
  }

  decrementConnections(serviceName: string, instanceId: string): void {
    const instance = this.findInstance(serviceName, instanceId);
    if (instance && instance.activeConnections > 0) instance.activeConnections--;
  }

  private findInstance(serviceName: string, instanceId: string): ServiceInstance | undefined {
    const entry = this.services.get(serviceName);
    if (!entry) return undefined;
    return entry.instances.find((i) => i.id === instanceId);
  }

  getInstanceCount(serviceName: string): number {
    return this.getInstances(serviceName).length;
  }

  getHealthyCount(serviceName: string): number {
    return this.getInstances(serviceName).filter((i) => i.healthy).length;
  }
}

export const serviceRegistry = new ServiceRegistry();
