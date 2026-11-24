import type { Route } from './+types/viewerLayout';
import { viewerApiMiddleware } from '~/middlewares/competition.server';

/** Around everything the check-in may not call. */
export const middleware: Route.MiddlewareFunction[] = [viewerApiMiddleware];
