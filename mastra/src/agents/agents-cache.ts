import type { AgentDef, AgentType } from '../llm/bindings.ts';
import { BUILTIN_AGENT_IDS } from '../llm/bindings.ts';

let _agents: AgentDef[] = [];
let _byId = new Map<string, AgentDef>();

export function setAgents(agents: AgentDef[]): void {
  _agents = agents;
  _byId = new Map(agents.map((a) => [a.id, a] as const));
}

export function getAgents(): AgentDef[] {
  return _agents;
}

export function getAgentById(id: string): AgentDef {
  const a = _byId.get(id);
  if (!a) throw new Error(`agent not found: ${id}`);
  return a;
}

export function getBuiltinAgent(type: AgentType): AgentDef {
  return getAgentById(BUILTIN_AGENT_IDS[type]);
}
