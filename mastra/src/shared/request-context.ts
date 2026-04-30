import type { RequestContext } from '@mastra/core/request-context';

export type AppRequestContextValues = {
  bookId: string;
  parentThreadId: string;
};

export type AppRequestContext = RequestContext<AppRequestContextValues>;

function readStringFromContext(
  ctx: { requestContext?: RequestContext<unknown> },
  key: string,
): string | undefined {
  const rc = ctx.requestContext;
  if (!rc) return undefined;
  try {
    const v = rc.get(key) as unknown;
    return typeof v === 'string' && v.trim() ? v : undefined;
  } catch {
    return undefined;
  }
}

export function readBookIdFromContext(ctx: { requestContext?: RequestContext<unknown> }): string | undefined {
  return readStringFromContext(ctx, 'bookId');
}

export function readParentThreadIdFromContext(
  ctx: { requestContext?: RequestContext<unknown> },
): string | undefined {
  return readStringFromContext(ctx, 'parentThreadId');
}
