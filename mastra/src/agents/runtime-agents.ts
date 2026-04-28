import { Agent } from '@mastra/core/agent';
import type { AgentDef, AgentType } from '../llm/bindings.ts';
import { createSubagents, type AgentDefResolver, type RuntimeSubagents } from './subagents.ts';
import { createSupervisorAgent } from './supervisor.ts';

export type RuntimeAgentSet = RuntimeSubagents & {
  supervisor: Agent;
};

export function createRuntimeAgents(agentDefs: ReadonlyMap<AgentType, AgentDef>): RuntimeAgentSet {
  const resolveAgentDef: AgentDefResolver = (type) => {
    const agentDef = agentDefs.get(type);
    if (!agentDef) {
      throw new Error(`阵容不完整: 缺少 ${type}`);
    }
    return agentDef;
  };

  const subagents = createSubagents(resolveAgentDef);

  return {
    supervisor: createSupervisorAgent(resolveAgentDef, subagents),
    ...subagents,
  };
}
