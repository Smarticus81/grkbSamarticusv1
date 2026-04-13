import type { ProcessDefinition } from '@regground/core';

export class ProcessRegistry {
  private map = new Map<string, ProcessDefinition>();

  register(def: ProcessDefinition): void {
    if (this.map.has(def.id)) throw new Error(`Process already registered: ${def.id}`);
    this.map.set(def.id, def);
  }

  get(id: string): ProcessDefinition | undefined {
    return this.map.get(id);
  }

  list(): ProcessDefinition[] {
    return Array.from(this.map.values());
  }

  byType(processType: string): ProcessDefinition[] {
    return this.list().filter((d) => d.requiredAgentTypes.some((t) => t.includes(processType)));
  }
}
