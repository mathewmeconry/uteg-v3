import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { egtModule } from '~/modules/egt/module';
import { DeleteCompetitionDialog } from './DeleteCompetitionDialog';
import { EgtSettingsForm } from './EgtSettingsForm';

const action = vi.fn();

function renderElement(element: React.ReactNode) {
  const router = createMemoryRouter([
    {
      path: '/',
      element,
      action: async ({ request }) => {
        action(Object.fromEntries(await request.formData()));
        return null;
      },
    },
  ]);
  return render(
    <I18nextProvider i18n={createI18n('en')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

function renderForm(props: Partial<React.ComponentProps<typeof EgtSettingsForm>> = {}) {
  return renderElement(
    <EgtSettingsForm
      savedConfig={egtModule.defaultConfig}
      attemptGrades={[{ apparatus: 'sprung', category: 'K5', attempts: 2, count: 12 }]}
      canEdit
      {...props}
    />,
  );
}

beforeAll(() => {
  // Radix Select needs them, jsdom has none.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
});
beforeEach(() => void action.mockReset());
afterEach(cleanup);

async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(screen.getByRole('option', { name: option }));
}

async function save() {
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  return JSON.parse(action.mock.calls[0][0].config);
}

describe('EgtSettingsForm', () => {
  it('posts the config', async () => {
    renderForm();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await choose('Rounding of the number', 'Always round up (as at the Swiss championships)');
    await choose('Precision of the grades', '3 decimals (as at the Swiss championships)');
    expect(await save()).toEqual({
      ...egtModule.defaultConfig,
      honourRounding: 'ceil',
      precision: 3,
    });
  });

  it('warns about grades that are recomputed', async () => {
    renderForm();
    await choose('Final grade in K5', 'Average');
    expect(screen.getByRole('alert')).toHaveTextContent(
      '12 saved vault grades are recomputed on saving.',
    );
    await choose('Attempts in K5', '3');
    expect(screen.getByRole('alert')).toHaveTextContent('stay unchanged');
    await choose('Attempts in K5', '2');
    await choose('Final grade in K5', 'Best attempt');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('has no aggregation for a single attempt', async () => {
    renderForm();
    await choose('Attempts in K4', '1');
    const aggregation = screen.getByRole('combobox', { name: 'Final grade in K4' });
    expect(aggregation).toBeDisabled();
    expect(aggregation).toHaveTextContent('Single grade');
    const { inputs } = await save();
    expect(inputs.sprung.categories.K4).toEqual({ attempts: 1, aggregation: 'NONE' });
  });

  it('orders the tie-break', async () => {
    renderForm();
    await userEvent.click(screen.getByRole('button', { name: 'Move Horizontal bar up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove Floor' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Vault' }));
    const { tieBreak } = await save();
    expect(tieBreak).toEqual(['schaukelringe', 'reck', 'barren', 'sprung']);
  });

  it('cannot be changed by viewers', () => {
    renderForm({ canEdit: false });
    for (const control of [
      ...screen.getAllByRole('combobox'),
      ...screen.getAllByRole('spinbutton'),
    ]) {
      expect(control).toBeDisabled();
    }
    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});

describe('DeleteCompetitionDialog', () => {
  it('only deletes with the exact name', async () => {
    renderElement(<DeleteCompetitionDialog name="Cup" />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete competition' }));
    const dialog = within(screen.getByRole('alertdialog'));
    const button = dialog.getByRole('button', { name: 'Delete permanently' });
    expect(button).toBeDisabled();
    await userEvent.type(dialog.getByRole('textbox'), 'cup');
    expect(button).toBeDisabled();
    await userEvent.clear(dialog.getByRole('textbox'));
    await userEvent.type(dialog.getByRole('textbox'), 'Cup');
    await userEvent.click(button);
    expect(action).toHaveBeenCalledWith({ intent: 'delete', confirmName: 'Cup' });
  });
});
