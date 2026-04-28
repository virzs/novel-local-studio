export { architect, chronicler, editor, loreKeeper } from './subagents.ts';
export { supervisor } from './supervisor.ts';
export { setBindings, getBindings } from './bindings-cache.ts';
export { setAgents, getAgents, getAgentById, getBuiltinAgent } from './agents-cache.ts';
export { createRuntimeAgents, type RuntimeAgentSet } from './runtime-agents.ts';

import { supervisor } from './supervisor.ts';
import { architect, chronicler, editor, loreKeeper } from './subagents.ts';

export const allAgents = {
  supervisor,
  architect,
  chronicler,
  editor,
  loreKeeper,
};
