import { Outlet } from 'react-router';
import type { Route } from './+types/gradeEntryLayout';
import { gradeEntryPageMiddleware } from '~/middlewares/competition.server';

/** Around the pages of the grade entry. */
export const middleware: Route.MiddlewareFunction[] = [gradeEntryPageMiddleware];

// Client navigations only run middleware on the server when a matched route has a loader.
export function loader() {
  return null;
}

export default function GradeEntryLayout() {
  return <Outlet />;
}
