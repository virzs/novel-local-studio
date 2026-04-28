import type { Bindings } from '../llm/providers.ts';

let _bindings: Bindings | null = null;

export function setBindings(b: Bindings): void {
  _bindings = b;
}

export function getBindings(): Bindings {
  if (!_bindings) throw new Error('bindings not loaded');
  return _bindings;
}
