import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { MemberRow } from './MemberRow';

const action = vi.fn();

function renderRow(isSelf: boolean) {
  const member = { userId: 'u1', email: 'a@example.com', role: 'OWNER' as const };
  const router = createMemoryRouter([
    {
      path: '/',
      element: <MemberRow member={member} isSelf={isSelf} isLastOwner={false} canManage />,
      action: async ({ request }) => {
        action(Object.fromEntries(await request.formData()));
        return null;
      },
    },
  ]);
  render(
    <I18nextProvider i18n={createI18n('en')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

async function chooseEditor() {
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(screen.getByRole('option', { name: 'Editor' }));
}

beforeAll(() => {
  // Radix Select needs them, jsdom has none.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});
beforeEach(() => void action.mockReset());
afterEach(cleanup);

const DEMOTION = { intent: 'role', userId: 'u1', role: 'EDITOR' };

describe('MemberRow', () => {
  it('changes the role of others at once', async () => {
    renderRow(false);
    await chooseEditor();
    await waitFor(() => expect(action).toHaveBeenCalledWith(DEMOTION));
  });

  it('asks before giving up the own ownership', async () => {
    renderRow(true);
    await chooseEditor();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole('combobox')).toHaveTextContent('Owner');
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());

    await chooseEditor();
    await userEvent.click(screen.getByRole('button', { name: 'Give up ownership' }));
    await waitFor(() => expect(action).toHaveBeenCalledWith(DEMOTION));
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveFocus());
  });
});
