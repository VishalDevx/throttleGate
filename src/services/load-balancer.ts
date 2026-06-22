import { ServiceInstance, serviceRegistry } from "./service-registry";

export type LoadBalanceStrategy = "weighted-round-robin" | "least-connections";

export class LoadBalancer {
  private strategy: LoadBalanceStrategy;
  private roundRobinCounters = new Map<string, number>();

  constructor(strategy: LoadBalanceStrategy = "weighted-round-robin") {
    this.strategy = strategy;
  }

  setStrategy(strategy: LoadBalanceStrategy): void {
    this.strategy = strategy;
  }

  select(serviceName: string): ServiceInstance | null {
    const instances = serviceRegistry.getInstances(serviceName);
    if (instances.length === 0) return null;

    switch (this.strategy) {
      case "weighted-round-robin":
        return this.weightedRoundRobin(instances);
      case "least-connections":
        return this.leastConnections(instances);
      default:
        return this.weightedRoundRobin(instances);
    }
  }

  private weightedRoundRobin(instances: ServiceInstance[]): ServiceInstance {
    const totalWeight = instances.reduce((sum, i) => sum + i.weight, 0);
    let counter = this.roundRobinCounters.get(instances[0]!.serviceName) ?? 0;
    counter = (counter + 1) % totalWeight;

    let cumulative = 0;
    for (const instance of instances) {
      cumulative += instance.weight;
      if (counter < cumulative) {
        this.roundRobinCounters.set(instance.serviceName, counter);
        return instance;
      }
    }

    // Fallback to first
    const first = instances[0]!;
    this.roundRobinCounters.set(first.serviceName, counter);
    return first;
  }

  private leastConnections(instances: ServiceInstance[]): ServiceInstance {
    let min = instances[0]!;
    for (const instance of instances) {
      if (instance.activeConnections < min.activeConnections) {
        min = instance;
      }
    }
    return min;
  }
}

export const loadBalancer = new LoadBalancer();
