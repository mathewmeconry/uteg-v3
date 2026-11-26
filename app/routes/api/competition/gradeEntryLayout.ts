import type { Route } from './+types/gradeEntryLayout';
import { gradeEntryApiMiddleware } from '~/middlewares/competition.server';

/** Around what the grade entry may call besides viewers. */
export const middleware: Route.MiddlewareFunction[] = [gradeEntryApiMiddleware];
