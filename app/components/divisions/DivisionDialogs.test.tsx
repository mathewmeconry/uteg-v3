import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, data, RouterProvider } from 'react-router';
import { useActionFetcher } from '~/hooks/useActionFetcher';
import { createI18n } from '~/lib/i18n';
import { DeleteDialog, GroundDialog, StartDialog, StopDialog } from './DivisionDialogs';
import type { Division } from './divisionList';

const onClose = vi.fn();

beforeEach(() => {
  onClose.mockClear();
  vi.stubGlobal('fetch', async () => new Response('{}'));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

type SharedProps = {
  Form: ReturnType<typeof useActionFetcher>['Form'];
  pending: boolean;
  onSubmit: () => void;
  onClose: () => void;
  onCloseAutoFocus: () => void;
};

function Page({ dialog }: { dialog: (props: SharedProps) => ReactNode }) {
  const { Form, pending } = useActionFetcher(onClose);
  return dialog({ Form, pending, onSubmit: () => {}, onClose, onCloseAutoFocus: () => {} });
}

/** Renders a dialog and returns what it submits. */
function renderDialog(dialog: (props: SharedProps) => ReactNode, result: unknown = null) {
  const submitted = vi.fn();
  const router = createMemoryRouter([
    {
      path: '/',
      element: <Page dialog={dialog} />,
      action: async ({ request }) => {
        submitted([...(await request.formData())]);
        return result;
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

describe('StartDialog', () => {
  it('lists what starts and leaves out what already runs', async () => {
    const list = [division('a'), division('b', { number: 2 }), division('c', { state: 'RUNNING' })];
    const submitted = renderDialog((props) => (
      <StartDialog divisions={list} running={[list[2]]} {...props} />
    ));
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
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('stays open when it failed', async () => {
    const submitted = renderDialog(
      (props) => <StartDialog divisions={[division('a')]} running={[]} {...props} />,
      data({ error: 'Geht nicht.' }, 400),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Starten' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Starten' })).toBeEnabled());
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('warns before restarting an ended division and only then confirms the restart', async () => {
    const ended = division('a', { state: 'ENDED', progress: { reck: 4 } });
    const submitted = renderDialog((props) => (
      <StartDialog divisions={[ended]} running={[]} {...props} />
    ));
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
    renderDialog((props) => <StartDialog divisions={[incomplete]} running={[ahead]} {...props} />);
    expect(screen.getByText(/2 nicht eingeteilt/)).toBeInTheDocument();
    expect(screen.getByText('Fortschritt geht verloren')).toBeInTheDocument();
    expect(screen.getByText('K7 Weiblich, Abteilung 1 (Wettkampfplatz 1)')).toBeInTheDocument();
  });

  it('cannot be confirmed once someone else started the division', () => {
    const running = division('a', { state: 'RUNNING' });
    renderDialog((props) => <StartDialog divisions={[running]} running={[running]} {...props} />);
    expect(screen.getByRole('button', { name: 'Starten' })).toBeDisabled();
  });
});

describe('StopDialog', () => {
  it('only stops running divisions', async () => {
    const list = [division('a'), division('b', { state: 'RUNNING', round: 1 })];
    const submitted = renderDialog((props) => <StopDialog divisions={list} {...props} />);
    expect(screen.getByText(/Durchgang 2 von 4/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stoppen' }));
    expect(submitted).toHaveBeenCalledWith([
      ['intent', 'stop'],
      ['division', 'b'],
    ]);
  });
});

describe('DeleteDialog', () => {
  it('leaves out running ones and says what happens to the starters', async () => {
    const list = [
      division('a'),
      division('b', { number: 2, state: 'ENDED' }),
      division('c', { number: 3, state: 'RUNNING' }),
    ];
    const submitted = renderDialog((props) => <DeleteDialog divisions={list} {...props} />);
    expect(screen.getByText('2 Abteilungen löschen?')).toBeInTheDocument();
    expect(screen.getByText(/6 Teilnehmende verlieren/)).toBeInTheDocument();
    expect(screen.getByRole('group')).toHaveTextContent(/aus der Rangliste.*Abteilung 2/);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    await userEvent.click(screen.getByRole('button', { name: 'Löschen' }));
    expect(submitted).toHaveBeenCalledWith([
      ['intent', 'delete'],
      ['division', 'a'],
      ['division', 'b'],
    ]);
  });
});

describe('GroundDialog', () => {
  it('stays open with its values when it failed', async () => {
    renderDialog(
      (props) => <GroundDialog division={division('a', { ground: 2 })} grounds={2} {...props} />,
      data({ error: 'Geht nicht.' }, 400),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled());
    expect(screen.getByRole('combobox')).toHaveTextContent('Wettkampfplatz 2');
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Schliessen' })).toBeInTheDocument();
  });
});
