import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { LineupBoard } from './LineupBoard';
import { UNASSIGNED, type Move } from './lineupMoves';

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
  const person = { firstname: id, lastname: 'L', clubId, clubName: `TV ${clubId}` };
  return { id, starterId: `s-${id}`, ...person, withdrawn };
}

const props = {
  entries: [entry('u'), entry('a'), entry('b', 'y'), entry('c'), entry('w', 'x', true)],
  columns: [
    { id: UNASSIGNED, entryIds: ['u'] },
    { id: 'reck', entryIds: ['a', 'b', 'c', 'w'] },
    { id: 'boden', entryIds: [] },
  ],
  editUrl: (starterId: string) => `/starters?edit=${starterId}`,
  columnName: (id: string) => ({ reck: 'Reck', boden: 'Boden' })[id] ?? 'Nicht eingeteilt',
};

function renderBoard({
  clubId = null,
  canEdit = true,
}: { clubId?: string | null; canEdit?: boolean } = {}) {
  const onMove = vi.fn<(move: Move) => void>();
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <MemoryRouter>
        <LineupBoard {...props} clubId={clubId} canEdit={canEdit} onMove={onMove} />
      </MemoryRouter>
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
    expect(screen.getByRole('heading', { name: 'Boden' })).toHaveFocus();
  });

  it('links to the starter', () => {
    renderBoard();
    const link = screen.getByRole('link', { name: 'L a bearbeiten' });
    expect(link).toHaveAttribute('href', '/starters?edit=s-a');
    expect(screen.queryByRole('link', { name: 'L w bearbeiten' })).not.toBeInTheDocument();
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
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
