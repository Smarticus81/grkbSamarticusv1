import type { BaseGroundedAgent } from './BaseGroundedAgent.js';

export type AgentFactory = () => BaseGroundedAgent<any, any>;

export interface AgentRegistration {
  agentType: string;
  version: string;
  description: string;
  processTypes: string[];
  factory: AgentFactory;
}

/**
 * In-process registry for grounded agents. Persistent registration metadata
 * lives in `agentRegistrations` (Postgres); this registry is the runtime
 * factory lookup.
 */
export class AgentRegistry {
  private map = new Map<string, AgentRegistration>();

  register(reg: AgentRegistration): void {
    const key = `${reg.agentType}@${reg.version}`;
    if (this.map.has(key)) {
      throw new Error(`Agent already registered: ${key}`);
    }
    this.map.set(key, reg);
  }

  get(agentType: string, version?: string): AgentRegistration | undefined {
    if (version) return this.map.get(`${agentType}@${version}`);
    // latest registered version that matches type
    let latest: AgentRegistration | undefined;
    for (const reg of this.map.values()) {
      if (reg.agentType === agentType) {
        if (!latest || this.compareVersions(reg.version, latest.version) > 0) latest = reg;
      }
    }
    return latest;
  }

  spawn(agentType: string, version?: string): BaseGroundedAgent<any, any> {
    const reg = this.get(agentType, version);
    if (!reg) throw new Error(`Unknown agent type: ${agentType}${version ? '@' + version : ''}`);
    return reg.factory();
  }

  forProcess(processType: string): AgentRegistration[] {
    return Array.from(this.map.values()).filter((r) => r.processTypes.includes(processType));
  }

  list(): AgentRegistration[] {
    return Array.from(this.map.values());
  }

  private compareVersions(a: string, b: string): number {
    const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  }
}
