import type { Route } from './+types/layout';
import { authMiddleware } from '~/middlewares/auth.server';
import { competitionMiddleware } from '~/middlewares/competition.server';

export const middleware: Route.MiddlewareFunction[] = [authMiddleware, competitionMiddleware];
