import { RouterContextProvider } from 'react-router';
import { toastContext, userContext } from '~/context';
import { competitionMiddleware, contestMiddleware } from '~/middlewares/competition.server';

type Form = Record<string, string | Blob | string[]>;

type Call = {
  userId: string;
  competitionId?: string;
  contestId?: string;
  /** Sent as multipart form data. */
  form?: Form;
};

/**
 * Calls a loader or action behind the middlewares of its layouts. Thrown and returned responses
 * both become `status`, `data` and `location`.
 */
export async function callRoute(
  handler: (args: any) => unknown,
  { userId, competitionId, contestId, form }: Call,
) {
  const context = new RouterContextProvider();
  context.set(userContext, { id: userId } as any);
  const params = { competitionId, contestId };
  const request = new Request('http://localhost/', form && { method: 'POST', body: toBody(form) });
  const next = async () => new Response();

  let result: any;
  try {
    if (competitionId) await competitionMiddleware({ request, params, context } as any, next);
    if (contestId) await contestMiddleware({ request, params, context } as any, next);
    result = await handler({ request, params, context });
  } catch (error) {
    if (error instanceof Error) throw error;
    result = error;
  }
  const isResponse = result instanceof Response;
  const isData = result?.type === 'DataWithResponseInit';
  return {
    status: (isResponse ? result.status : result?.init?.status) ?? 200,
    data: isData ? result.data : result,
    location: isResponse ? result.headers.get('Location') : null,
    toasts: context.get(toastContext),
  };
}

function toBody(form: Form) {
  const body = new FormData();
  for (const [name, value] of Object.entries(form)) {
    for (const item of [value].flat()) body.append(name, item);
  }
  return body;
}
