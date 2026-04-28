import type { AgentDef, Bindings, Lineup, ProviderConfig } from './types';

export function makeConfigApi(backendUrl: string) {
  const url = (p: string) => `${backendUrl}${p}`;

  return {
    async getProviders(): Promise<ProviderConfig[]> {
      const r = await fetch(url('/api/config/providers'));
      const j = (await r.json()) as { providers: ProviderConfig[] };
      return j.providers;
    },
    async saveProviders(providers: ProviderConfig[]): Promise<void> {
      const r = await fetch(url('/api/config/providers'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ providers }),
      });
      if (!r.ok) throw new Error(`save providers failed: ${r.status}`);
    },
    async getBindings(): Promise<Bindings> {
      const r = await fetch(url('/api/config/bindings'));
      const j = (await r.json()) as { bindings: Bindings };
      return j.bindings;
    },
    async saveBindings(bindings: Bindings): Promise<void> {
      const r = await fetch(url('/api/config/bindings'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bindings }),
      });
      if (!r.ok) throw new Error(`save bindings failed: ${r.status}`);
    },
    async testProvider(
      providerId: string,
      model: string,
      inline?: { baseUrl?: string; apiKey?: string; headers?: Record<string, string> },
    ): Promise<{ ok: boolean; text?: string; error?: string }> {
      const r = await fetch(url('/api/config/test'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inline ? { model, provider: inline } : { providerId, model }),
      });
      return (await r.json()) as { ok: boolean; text?: string; error?: string };
    },
    async listProviderModels(
      providerId: string,
      inline?: { baseUrl?: string; apiKey?: string; headers?: Record<string, string> },
    ): Promise<{ ok: boolean; models?: string[]; error?: string }> {
      const r = await fetch(url('/api/config/providers/models'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(inline ? { provider: inline } : { providerId }),
      });
      return (await r.json()) as { ok: boolean; models?: string[]; error?: string };
    },
    async getAgentTypeMeta(): Promise<{
      agents: Array<{
        id: string;
        label: string;
        description: string;
        systemPrompt: string;
        tools: string[];
      }>;
    }> {
      const r = await fetch(url('/api/agents'));
      return (await r.json()) as {
        agents: Array<{
          id: string;
          label: string;
          description: string;
          systemPrompt: string;
          tools: string[];
        }>;
      };
    },
    async getAgentDefs(): Promise<AgentDef[]> {
      const r = await fetch(url('/api/config/agents'));
      const j = (await r.json()) as { agents: AgentDef[] };
      return j.agents;
    },
    async saveAgentDefs(agents: AgentDef[]): Promise<void> {
      const r = await fetch(url('/api/config/agents'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agents }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `save agents failed: ${r.status}`);
      }
    },
    async getLineups(): Promise<Lineup[]> {
      const r = await fetch(url('/api/config/lineups'));
      const j = (await r.json()) as { lineups: Lineup[] };
      return j.lineups;
    },
    async saveLineups(lineups: Lineup[]): Promise<void> {
      const r = await fetch(url('/api/config/lineups'), {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lineups }),
      });
      if (!r.ok) {
        const j = (await r.json().catch(() => null)) as { error?: string } | null;
        throw new Error(j?.error ?? `save lineups failed: ${r.status}`);
      }
    },
  };
}
