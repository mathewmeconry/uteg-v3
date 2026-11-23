import { data, isRouteErrorResponse } from 'react-router';

/**
 * Keeps the page when the server cannot be reached, a proxy answers instead of it, or the action is
 * refused. Without it the error page would replace what the user was working on. Use it as
 * `export const clientAction = safeClientAction` and submit with useActionFetcher, which tells the
 * user.
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
