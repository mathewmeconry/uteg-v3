import type { Route } from './+types/gradeEntryLayout';
import { apiMiddleware } from '~/middlewares/competition.server';

/** Around what the grade entry may call besides viewers. */
export const middleware: Route.MiddlewareFunction[] = [apiMiddleware('view', 'grade')];
