import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { DeleteDialog, StartDialog, StopDialog } from './DivisionDialogs';
import type { Division } from './divisionList';

afterEach(cleanup);

function division(id: string, data: Partial<Division> = {}) {
  return {
    id,
    category: 'K5',
    sex: 'FEMALE',
    number: 1,
    ground: 1,
    state: 'PENDING',
    round: 0,
    rounds: 4,
    starterCount: 3,
    unassignedCount: 0,
    progress: {},
    ...data,
  } as Division;
}

/** Renders a dialog and returns what it submits. */
function renderDialog(element: React.ReactNode) {
  const submitted = vi.fn();
  const router = createMemoryRouter([
    {
      path: '/',
      element,
      action: async ({ request }) => {
        submitted([...(await request.formData())]);
        return null;
      },
    },
  ]);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
  return submitted;
}

const onClose = vi.fn();

describe('StartDialog', () => {
  it('lists what starts and leaves out what already runs', async () => {
    const list = [division('a'), division('b', { number: 2 }), division('c', { state: 'RUNNING' })];
    const submitted = renderDialog(
      <StartDialog divisions={list} running={[list[2]]} onClose={onClose} />,
    );
    expect(screen.getByText('2 Abteilungen starten?')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'K5 Weiblich, Abteilung 1 (Wettkampfplatz 1)',
      'K5 Weiblich, Abteilung 2 (Wettkampfplatz 1)',
    ]);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Starten' }));
    expect(submitted).toHaveBeenCalledWith([
      ['intent', 'start'],
      ['division', 'a'],
      ['division', 'b'],
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it('warns before restarting an ended division and only then confirms the restart', async () => {
    const ended = division('a', { state: 'ENDED', progress: { reck: 4 } });
    const submitted = renderDialog(
      <StartDialog divisions={[ended]} running={[]} onClose={onClose} />,
    );
    expect(screen.getByText('Beendete Abteilung neu starten?')).toBeInTheDocument();
    expect(screen.getByText(/Die Noten bleiben erhalten/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Neu starten' }));
    expect(submitted).toHaveBeenCalledWith([
      ['intent', 'start'],
      ['restart', 'true'],
      ['division', 'a'],
    ]);
  });

  it('warns about unassigned starters, lost progress and divisions that are ahead', () => {
    const ahead = division('r', { category: 'K7', state: 'RUNNING', progress: { reck: 1 } });
    const incomplete = division('a', { unassignedCount: 2, progress: { reck: 1 } });
    renderDialog(<StartDialog divisions={[incomplete]} running={[ahead]} onClose={onClose} />);
    expect(screen.getByText(/2 nicht eingeteilt/)).toBeInTheDocument();
    expect(screen.getByText('Fortschritt geht verloren')).toBeInTheDocument();
    expect(screen.getByText('K7 Weiblich, Abteilung 1 (Wettkampfplatz 1)')).toBeInTheDocument();
  });

  it('cannot be confirmed once someone else started the division', () => {
    const running = division('a', { state: 'RUNNING' });
    renderDialog(<StartDialog divisions={[running]} running={[running]} onClose={onClose} />);
    expect(screen.getByRole('button', { name: 'Starten' })).toBeDisabled();
  });
});

describe('StopDialog', () => {
  it('only stops running divisions', async () => {
    const list = [division('a'), division('b', { state: 'RUNNING', round: 1 })];
    const submitted = renderDialog(<StopDialog divisions={list} onClose={onClose} />);
    expect(screen.getByText(/Durchgang 2 von 4/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stoppen' }));
    expect(submitted).toHaveBeenCalledWith([
      ['intent', 'stop'],
      ['division', 'b'],
    ]);
  });
});

describe('DeleteDialog', () => {
  it('says what happens to the starters', async () => {
    const submitted = renderDialog(<DeleteDialog division={division('a')} onClose={onClose} />);
    expect(screen.getByText(/3 Teilnehmende verlieren/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(submitted).toHaveBeenCalledWith([
      ['intent', 'delete'],
      ['division', 'a'],
    ]);
  });
});
