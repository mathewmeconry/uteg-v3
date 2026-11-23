import { data } from 'react-router';

export function loader() {
  throw data(null, 404);
}

export function action() {
  throw data(null, 404);
}

// A component, so that the error page of the root is rendered.
export default function NotFound() {
  return null;
}
