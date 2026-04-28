import type { RequestContext } from '@mastra/core/request-context';

export type AppRequestContextValues = {
  bookId: string;
};

export type AppRequestContext = RequestContext<AppRequestContextValues>;

export function readBookIdFromContext(ctx: { requestContext?: RequestContext<unknown> }): string | undefined {
  const rc = ctx.requestContext;
  if (!rc) return undefined;
  try {
    const v = rc.get('bookId') as unknown;
    return typeof v === 'string' && v.trim() ? v : undefined;
  } catch {
    return undefined;
  }
}
