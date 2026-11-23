import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, data, redirect, RouterProvider } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '~/lib/i18n';
import { safeClientAction } from '~/lib/safeClientAction';
import { useActionFetcher } from './useActionFetcher';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const onSuccess = vi.fn();
const loader = vi.fn(() => null);
const healthz = vi.fn(async () => new Response('{}'));

beforeEach(() => {
  vi.clearAllMocks();
  healthz.mockImplementation(async () => new Response('{}'));
  vi.stubGlobal('fetch', healthz);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function Page() {
  const { Form, pending } = useActionFetcher(onSuccess);
  return (
    <Form method="post">
      <button>{pending ? 'pending' : 'send'}</button>
    </Form>
  );
}

/** Submits to an action that does what the server would. */
async function submit(serverAction: () => unknown) {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: <Page />,
        loader,
        action: () => safeClientAction({ serverAction: async () => serverAction() as any }),
        errorElement: <p>error page</p>,
      },
      { path: '/other', element: <p>other page</p> },
    ],
    { hydrationData: { loaderData: { '0': null } } },
  );
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
  await userEvent.click(screen.getByRole('button'));
}

describe('useActionFetcher', () => {
  it('reports success once, after the page has the new data', async () => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    await submit(() => gate.then(() => null));
    expect(screen.getByText('pending')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    await act(async () => release());
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(loader).toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('shows the error of the action and reloads', async () => {
    await submit(() => data({ error: 'Nicht gefunden.' }, 404));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Nicht gefunden.'));
    await waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(screen.getByText('send')).toBeInTheDocument();
  });

  it('stays on the page when the server cannot be reached', async () => {
    healthz.mockRejectedValue(new TypeError('Failed to fetch'));
    await submit(() => {
      throw new TypeError('Failed to fetch');
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Verbindung')),
    );
    expect(screen.getByText('send')).toBeInTheDocument();
    expect(onSuccess).not.toHaveBeenCalled();
    // Loading would fail too and replace the page.
    expect(loader).not.toHaveBeenCalled();
  });

  it('does not report form errors as success', async () => {
    await submit(() => data({ errors: { name: 'Bitte ausfüllen' } }, 400));
    await waitFor(() => expect(screen.getByText('send')).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('explains a missing role', async () => {
    const forbidden = { status: 403, statusText: '', internal: false, data: null };
    await submit(() => {
      throw forbidden;
    });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Dafür fehlt dir die Berechtigung.'),
    );
  });

  it('follows redirects', async () => {
    await submit(() => {
      throw redirect('/other');
    });
    expect(await screen.findByText('other page')).toBeInTheDocument();
  });
});
