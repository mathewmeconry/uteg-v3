import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider, useActionData } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { CreateWizard, getErrorStep } from './CreateWizard';

const submitted = vi.fn();
let response: unknown;

function Page() {
  const errors = useActionData() as Record<string, string> | undefined;
  return <CreateWizard ownEmail="me@example.com" errors={errors} />;
}

beforeAll(() => {
  // Radix Checkbox needs it, jsdom has none.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
beforeEach(() => {
  submitted.mockReset();
  response = null;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  URL.createObjectURL = vi.fn(() => 'blob:logo');
  URL.revokeObjectURL = vi.fn();
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Page />,
      action: () => {
        // The request cannot be read: its multipart body comes from jsdom's FormData.
        const form = document.querySelector('form')!;
        submitted(Object.fromEntries(new FormData(form)));
        return response;
      },
    },
  ]);
  render(
    <I18nextProvider i18n={createI18n('en')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const heading = () => screen.getByRole('heading', { level: 2 }).textContent;
const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));

/** Clicks right after a step was opened are taken for the second half of a double click. */
let clock = 0;
function pause() {
  clock += 1000;
}

async function next() {
  pause();
  await click('Next');
}

async function create() {
  pause();
  await click('Create competition');
}

async function fillGeneral() {
  await userEvent.type(screen.getByLabelText('Name'), 'Cup');
  await userEvent.type(screen.getByLabelText('Location'), 'Bern');
  await userEvent.type(screen.getByLabelText('First day'), '2026-05-01');
}

async function goToMembers() {
  await fillGeneral();
  await next();
  await next();
  await next();
  expect(heading()).toBe('Members');
}

describe('CreateWizard', () => {
  it('stays on a step with missing values', async () => {
    await next();
    expect(heading()).toBe('General');
  });

  it('collects all steps and posts them at the end', async () => {
    await fillGeneral();
    expect(screen.getByLabelText('Last day')).toHaveValue('2026-05-01');
    await next();
    await userEvent.clear(screen.getByLabelText('Number of grounds'));
    await userEvent.type(screen.getByLabelText('Number of grounds'), '3');
    await next();

    const women = within(screen.getByRole('group', { name: 'Female' }));
    await userEvent.clear(women.getByLabelText(/^K5/));
    await userEvent.type(women.getByLabelText(/^K5/), '40');
    await next();
    await next();

    expect(heading()).toBe('Review');
    expect(screen.getByText('33 to 40 %, depending on the category')).toBeInTheDocument();
    expect(screen.getByText('Number of grounds: 3')).toBeInTheDocument();
    expect(submitted).not.toHaveBeenCalled();

    await create();
    await waitFor(() => expect(submitted).toHaveBeenCalledOnce());
    const [form] = submitted.mock.calls[0];
    expect(form).toMatchObject({
      name: 'Cup',
      location: 'Bern',
      startDate: '2026-05-01',
      endDate: '2026-05-01',
      grounds: '3',
      modules: 'egt',
      members: '[]',
    });
    const { honourPercent } = JSON.parse(form['config.egt']);
    expect(honourPercent.FEMALE.K5).toBe(40);
    expect(honourPercent.MALE.K5).toBe(33);
  });

  it('needs a module', async () => {
    await fillGeneral();
    await next();
    await userEvent.click(screen.getByRole('checkbox'));
    await next();
    expect(heading()).toBe('Setup');
    expect(screen.getByRole('alert')).toHaveTextContent('Select at least one module.');
  });

  it('sets all percentages at once', async () => {
    await fillGeneral();
    await next();
    await next();
    await userEvent.clear(screen.getByLabelText('All categories'));
    await userEvent.type(screen.getByLabelText('All categories'), '25');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    for (const input of screen.getAllByLabelText(/^K\w/)) expect(input).toHaveValue(25);
  });

  it('adds members and refuses oneself, duplicates and broken addresses', async () => {
    await goToMembers();
    const email = screen.getByLabelText('Email');
    await userEvent.type(email, 'A@example.com{Enter}');
    expect(screen.getByText('a@example.com')).toBeInTheDocument();
    for (const [text, message] of [
      ['a@example.com', 'This address is already on the list.'],
      ['me@example.com', 'You already are the owner.'],
      ['x', 'Enter a valid email address.'],
    ]) {
      await userEvent.clear(email);
      await userEvent.type(email, `${text}{Enter}`);
      expect(screen.getByRole('alert')).toHaveTextContent(message);
    }
    await userEvent.click(screen.getByRole('button', { name: 'Remove a@example.com' }));
    expect(screen.queryByText('a@example.com')).not.toBeInTheDocument();
  });

  it('adds an address that was typed but not added', async () => {
    await goToMembers();
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
    await next();
    expect(heading()).toBe('Review');
    expect(screen.getByText('a@example.com, Editor')).toBeInTheDocument();
  });

  it('goes back to the step the server complains about', async () => {
    await goToMembers();
    await userEvent.type(screen.getByLabelText('Email'), 'a@example.com');
    await next();
    response = { members: 'No account' };
    await create();
    expect(await screen.findByRole('alert')).toHaveTextContent('No account');
    expect(heading()).toBe('Members');
    // The message is about the list that was sent.
    await click('Remove a@example.com');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('refuses addresses the server would refuse', async () => {
    await goToMembers();
    await userEvent.type(screen.getByLabelText('Email'), 'a@exa_mple.com{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email address.');
  });

  it('ignores the second half of a double click', async () => {
    await goToMembers();
    await next();
    expect(heading()).toBe('Review');
    await click('Create competition');
    expect(submitted).not.toHaveBeenCalled();
    await create();
    await waitFor(() => expect(submitted).toHaveBeenCalledOnce());
  });

  it('lets a chosen logo be cleared', async () => {
    const input = screen.getByLabelText<HTMLInputElement>('Logo');
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
    await userEvent.upload(input, new File(['x'], 'logo.png', { type: 'image/png' }));
    expect(input.files).toHaveLength(1);
    await click('Clear selection');
    expect(input.files).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'Clear selection' })).not.toBeInTheDocument();
  });
});

describe('getErrorStep', () => {
  it.each([
    [{}, undefined],
    [{ members: 'x', grounds: 'x' }, 'setup'],
    [{ config: 'x' }, 'modules'],
    [{ endDate: 'x', members: 'x' }, 'general'],
  ])('%o is on %s', (errors, step) => {
    expect(getErrorStep(errors as Record<string, string>)).toBe(step);
  });
});
