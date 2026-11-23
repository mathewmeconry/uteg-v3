import {
  RouterContextProvider,
  UNSAFE_ErrorResponseImpl,
  type MiddlewareFunction,
} from 'react-router';
import { toastContext, userContext } from '~/context';
import { middleware as apiMiddleware } from '~/routes/api/competition/layout';
import { middleware as competitionMiddleware } from '~/routes/secured/competition/layout';
import { middleware as securedMiddleware } from '~/routes/secured/layout';

type Handler = (args: any) => unknown;

const MIDDLEWARES = {
  page: [...securedMiddleware, ...competitionMiddleware],
  api: apiMiddleware,
};

/** Calls a loader or action below the competition layout, with its real middlewares. */
export async function callRoute(
  handler: Handler,
  {
    layout,
    userId,
    competitionId,
    search = '',
    body,
  }: {
    layout: keyof typeof MIDDLEWARES;
    userId: string | null;
    competitionId: string;
    search?: string;
    /** Form fields, or anything else that is sent as JSON. */
    body?: URLSearchParams | object;
  },
) {
  const context = new RouterContextProvider();
  if (userId) context.set(userContext, { id: userId } as any);
  const isForm = body instanceof URLSearchParams;
  const request = new Request(`http://localhost/competitions/${competitionId}${search}`, {
    method: body ? 'POST' : 'GET',
    body: isForm ? body : body && JSON.stringify(body),
    headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
  });
  const args = { request, context, params: { competitionId } };

  let result: any;
  const run = (middlewares: MiddlewareFunction<Response>[]): Promise<Response> => {
    const [middleware, ...rest] = middlewares;
    if (middleware) return middleware(args as any, () => run(rest)) as Promise<Response>;
    return Promise.resolve(handler(args)).then((value) => {
      result = value;
      return new Response();
    });
  };
  try {
    await run(MIDDLEWARES[layout] as MiddlewareFunction<Response>[]);
  } catch (error) {
    return { status: statusOf(error), data: undefined, toasts: [] };
  }
  const isData = result?.type === 'DataWithResponseInit';
  return {
    status: statusOf(result) ?? 200,
    data: isData ? result.data : result,
    toasts: context.get(toastContext),
  };
}

function statusOf(value: any): number | undefined {
  if (value instanceof Response || value instanceof UNSAFE_ErrorResponseImpl) return value.status;
  if (value instanceof Error) throw value;
  return value?.init?.status;
}
