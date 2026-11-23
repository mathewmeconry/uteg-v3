import { data, isRouteErrorResponse } from 'react-router';

/**
 * Keeps the page when the server cannot be reached, a proxy answers instead of it, or the action is
 * refused. Without it the error page would replace what the user was working on. Use it as
 * `export const clientAction = safeClientAction` and submit with useActionFetcher, which tells the
 * user, or use useActionErrors for a plain <Form>.
 */
export async function safeClientAction({ serverAction }: { serverAction: () => Promise<unknown> }) {
  try {
    return await serverAction();
  } catch (error) {
    // Redirects.
    if (error instanceof Response) throw error;
    const failed = isRouteErrorResponse(error) ? error.status : 503;
    // The status keeps the router from loading the page, which would fail as well.
    return data({ failed }, failed);
  }
}

/** The form field that names a request of useActionSave. */
export const AUTOSAVE_FIELD = 'autosaveId';

/** What the actions answered, by request. Fetchers forget it when their form is gone. */
export const autosaveAnswers = new Map<string, unknown>();

/**
 * The same for forms that save by themselves, see useActionSave. They keep the page also when the
 * session has ended, nobody expects to leave it while typing.
 */
export async function autosaveClientAction({
  request,
  serverAction,
}: {
  request: Request;
  serverAction: () => Promise<unknown>;
}) {
  const id = (await request.clone().formData()).get(AUTOSAVE_FIELD);
  let answer;
  try {
    answer = await safeClientAction({ serverAction });
  } catch (error) {
    const target = error instanceof Response ? error.headers.get('Location') : null;
    if (!target?.startsWith('/login')) throw error;
    answer = data({ failed: 401 }, 401);
  }
  if (typeof id === 'string') autosaveAnswers.set(id, isData(answer) ? answer.data : answer);
  return answer;
}

function isData(value: unknown): value is { data: unknown } {
  return typeof value === 'object' && value !== null && 'init' in value && 'data' in value;
}
