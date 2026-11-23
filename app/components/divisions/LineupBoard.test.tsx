import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, data, RouterProvider, useLoaderData } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { LineupBoard } from './LineupBoard';
import { UNASSIGNED, type Move } from './lineupMoves';
import { useLineupMoves } from './useLineupMoves';

afterEach(cleanup);

// Radix checkboxes measure themselves.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

function entry(id: string, clubId = 'x', withdrawn = false) {
  return { id, firstname: id, lastname: 'L', clubId, clubName: `TV ${clubId}`, withdrawn };
}

const props = {
  entries: [entry('u'), entry('a'), entry('b', 'y'), entry('c'), entry('w', 'x', true)],
  columns: [
    { id: UNASSIGNED, entryIds: ['u'] },
    { id: 'reck', entryIds: ['a', 'b', 'c', 'w'] },
    { id: 'boden', entryIds: [] },
  ],
  columnName: (id: string) => ({ reck: 'Reck', boden: 'Boden' })[id] ?? 'Nicht eingeteilt',
};

function renderBoard({
  clubId = null,
  canEdit = true,
}: { clubId?: string | null; canEdit?: boolean } = {}) {
  const onMove = vi.fn<(move: Move) => void>();
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <LineupBoard {...props} clubId={clubId} canEdit={canEdit} onMove={onMove} />
    </I18nextProvider>,
  );
  return onMove;
}

const click = (name: string) => userEvent.click(screen.getByRole('button', { name }));
const check = (name: string) => userEvent.click(screen.getByRole('checkbox', { name }));
const reck = () => within(screen.getByRole('region', { name: 'Reck' }));

describe('LineupBoard', () => {
  it('moves an entry up and down', async () => {
    const onMove = renderBoard();
    await click('L b nach oben');
    await click('L a nach unten');
    expect(onMove.mock.calls).toEqual([
      [{ entryIds: ['b'], columnId: 'reck', beforeId: 'a' }],
      [{ entryIds: ['a'], columnId: 'reck', beforeId: 'c' }],
    ]);
  });

  it('does not move past the start', async () => {
    const onMove = renderBoard();
    await click('L a nach oben');
    expect(onMove).not.toHaveBeenCalled();
  });

  it('moves selected entries in the order shown', async () => {
    const onMove = renderBoard();
    await check('L c auswählen');
    await check('L a auswählen');
    await check('L u auswählen');
    await click('Boden');
    expect(onMove).toHaveBeenCalledWith({ entryIds: ['u', 'a', 'c'], columnId: 'boden' });
    expect(screen.queryByRole('group', { name: 'Auswahl verschieben' })).not.toBeInTheDocument();
  });

  it('selects everyone of a list except the withdrawn', async () => {
    const onMove = renderBoard();
    await check('Alle auswählen: Reck');
    await click('Nicht eingeteilt');
    expect(onMove).toHaveBeenCalledWith({ entryIds: ['a', 'b', 'c'], columnId: UNASSIGNED });
  });

  it('only shows and moves the filtered club, with the real positions', async () => {
    const onMove = renderBoard({ clubId: 'x' });
    expect(screen.queryByText('L b')).not.toBeInTheDocument();
    expect(reck().getByText('3.')).toBeInTheDocument();
    expect(reck().getByText('2 / 3')).toBeInTheDocument();
    await check('Alle auswählen: Reck');
    await click('Boden');
    expect(onMove).toHaveBeenCalledWith({ entryIds: ['a', 'c'], columnId: 'boden' });
  });

  it('keeps withdrawn entries in place', () => {
    renderBoard();
    expect(screen.getByText('L w')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'L w verschieben' })).not.toBeInTheDocument();
    expect(reck().getByText('3')).toBeInTheDocument();
  });

  it('has nothing to change for viewers', () => {
    renderBoard({ canEdit: false });
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('useLineupMoves', () => {
  it('shows moves at once and sends them in order', async () => {
    const sent: string[][] = [];
    let release = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let move: (next: Move) => void = () => {};

    let server = [
      { id: UNASSIGNED, entryIds: [] as string[] },
      { id: 'reck', entryIds: ['a', 'b'] },
    ];

    function Page() {
      const loaderData = useLoaderData<{ columns: typeof server }>();
      const moves = useLineupMoves(loaderData.columns, loaderData);
      move = moves.move;
      return <p>{moves.columns.map(({ entryIds }) => entryIds.join('')).join('|')}</p>;
    }
    const router = createMemoryRouter([
      {
        path: '/',
        element: <Page />,
        HydrateFallback: () => null,
        loader: () => ({ columns: server }),
        action: async ({ request }) => {
          const values = [...(await request.formData()).values()] as string[];
          sent.push(values);
          await gate;
          // The server refuses the second move.
          if (sent.length > 1) return data(null, 400);
          server = [server[0], { id: 'reck', entryIds: ['b', 'a'] }];
          return null;
        },
      },
    ]);
    render(<RouterProvider router={router} />);
    await screen.findByText('|ab');

    await act(async () => {
      move({ entryIds: ['b'], columnId: 'reck', beforeId: 'a' });
      move({ entryIds: ['a'], columnId: UNASSIGNED });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(screen.getByText('a|b')).toBeInTheDocument();
    expect(sent).toEqual([['b', 'move', 'reck', 'a']]);

    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(sent[1]).toEqual(['a', 'unassign']);
    await act(() => router.revalidate());
    expect(screen.getByText('|ba')).toBeInTheDocument();
  });
});
