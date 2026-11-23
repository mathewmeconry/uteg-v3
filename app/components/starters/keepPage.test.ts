import { UNSAFE_ErrorResponseImpl } from 'react-router';
import { expect, it } from 'vitest';
import { clientAction as startersAction } from '~/routes/secured/competition/starters';
import { clientAction as importAction } from '~/routes/secured/competition/startersImport';
import { keepPage } from './keepPage';

it.each([
  [new TypeError('Failed to fetch'), 'network'],
  [new UNSAFE_ErrorResponseImpl(404, 'Not Found', null), 'notFound'],
  [new UNSAFE_ErrorResponseImpl(403, 'Forbidden', null), 'forbidden'],
  [new UNSAFE_ErrorResponseImpl(502, 'Bad Gateway', null), 'server'],
  [new Error('anything else'), 'server'],
])('turns %s into a result, without loading the page again', async (error, failed) => {
  expect(await keepPage(() => Promise.reject(error))).toMatchObject({
    data: { failed },
    // React Router does not revalidate after an error status.
    init: { status: 500 },
  });
});

it.each([
  ['starters', startersAction],
  ['import', importAction],
])('is used by the %s page', async (_, clientAction) => {
  const serverAction = () => Promise.reject(new TypeError('Failed to fetch'));
  expect(await clientAction({ serverAction } as never)).toMatchObject({
    data: { failed: 'network' },
  });
});

it('passes on results and redirects', async () => {
  expect(await keepPage(async () => ({ ok: true }))).toEqual({ ok: true });
  const redirect = new Response(null, { status: 302 });
  await expect(keepPage(() => Promise.reject(redirect))).rejects.toBe(redirect);
});
