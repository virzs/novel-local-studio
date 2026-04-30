import { Agent } from '@mastra/core/agent';
import { registry } from '../llm/providers.ts';
import type { AgentDef, AgentType } from '../llm/bindings.ts';
import { getBuiltinAgent } from './agents-cache.ts';
import { readOnlyDocumentTools, createDocumentTool, createFolderTool, updateDocumentTool, archiveDocumentTool, restoreDocumentTool } from '../tools/documents.ts';
import { searchTools } from '../tools/search.ts';
import { getMastraMemory } from '../db/mastra-store.ts';

export type SubagentType = Exclude<AgentType, 'supervisor'>;

export type AgentDefResolver = (type: AgentType) => AgentDef;

export type RuntimeSubagents = Record<SubagentType, Agent>;

const defaultAgentDefResolver: AgentDefResolver = (type) => getBuiltinAgent(type);

const subagentDescriptions: Record<SubagentType, string> = {
  architect:
    'Plans novel structure (outlines, arcs, pacing) AND creates/updates setting-layer documents: characters, settings, places, factions, timelines, terminology.',
  chronicler: 'Drafts chapter prose based on structural plans. Writes narrative text.',
  editor: 'Polishes and rewrites prose for style, clarity, continuity.',
  loreKeeper:
    'Consistency checker and library organizer. Verifies names/places/timelines/rules across documents and reports conflicts; may make small consistency-fix edits via updateDocument. Also reorganizes misplaced setting-layer documents into proper category folders (creates folders via createFolder, moves docs via updateDocument(parentId)). Does NOT create new setting/chapter/outline content documents.',
};

const subagentNames: Record<SubagentType, string> = {
  architect: 'Architect',
  chronicler: 'Chronicler',
  editor: 'Editor',
  loreKeeper: 'LoreKeeper',
};

export function createArchitectAgent(resolveAgentDef: AgentDefResolver = defaultAgentDefResolver): Agent {
  return new Agent({
    id: 'architect',
    name: subagentNames.architect,
    description: subagentDescriptions.architect,
    instructions: () => resolveAgentDef('architect').systemPrompt,
    model: () => registry.getLanguageModel(resolveAgentDef('architect')),
    tools: {
      ...readOnlyDocumentTools,
      ...searchTools,
      createDocument: createDocumentTool,
      createFolder: createFolderTool,
      updateDocument: updateDocumentTool,
      archiveDocument: archiveDocumentTool,
      restoreDocument: restoreDocumentTool,
    },
    memory: () => getMastraMemory(),
  });
}

export function createChroniclerAgent(resolveAgentDef: AgentDefResolver = defaultAgentDefResolver): Agent {
  return new Agent({
    id: 'chronicler',
    name: subagentNames.chronicler,
    description: subagentDescriptions.chronicler,
    instructions: () => resolveAgentDef('chronicler').systemPrompt,
    model: () => registry.getLanguageModel(resolveAgentDef('chronicler')),
    tools: {
      ...readOnlyDocumentTools,
      ...searchTools,
      updateDocument: updateDocumentTool,
    },
    memory: () => getMastraMemory(),
  });
}

export function createEditorAgent(resolveAgentDef: AgentDefResolver = defaultAgentDefResolver): Agent {
  return new Agent({
    id: 'editor',
    name: subagentNames.editor,
    description: subagentDescriptions.editor,
    instructions: () => resolveAgentDef('editor').systemPrompt,
    model: () => registry.getLanguageModel(resolveAgentDef('editor')),
    tools: {
      ...readOnlyDocumentTools,
      ...searchTools,
      updateDocument: updateDocumentTool,
    },
    memory: () => getMastraMemory(),
  });
}

export function createLoreKeeperAgent(resolveAgentDef: AgentDefResolver = defaultAgentDefResolver): Agent {
  return new Agent({
    id: 'loreKeeper',
    name: subagentNames.loreKeeper,
    description: subagentDescriptions.loreKeeper,
    instructions: () => resolveAgentDef('loreKeeper').systemPrompt,
    model: () => registry.getLanguageModel(resolveAgentDef('loreKeeper')),
    tools: {
      ...readOnlyDocumentTools,
      ...searchTools,
      createFolder: createFolderTool,
      updateDocument: updateDocumentTool,
      archiveDocument: archiveDocumentTool,
      restoreDocument: restoreDocumentTool,
    },
    memory: () => getMastraMemory(),
  });
}

export function createSubagents(resolveAgentDef: AgentDefResolver = defaultAgentDefResolver): RuntimeSubagents {
  return {
    architect: createArchitectAgent(resolveAgentDef),
    chronicler: createChroniclerAgent(resolveAgentDef),
    editor: createEditorAgent(resolveAgentDef),
    loreKeeper: createLoreKeeperAgent(resolveAgentDef),
  };
}

const builtinSubagents = createSubagents();

export const architect = builtinSubagents.architect;
export const chronicler = builtinSubagents.chronicler;
export const editor = builtinSubagents.editor;
export const loreKeeper = builtinSubagents.loreKeeper;
