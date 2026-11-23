import { act, cleanup, render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { useGradeDrafts, type GradeDrafts } from './useGradeDrafts';

const KEY = 'reck:e1';
const SLOT = {
  entryId: 'e1',
  apparatus: 'reck',
  firstname: 'Anna',
  lastname: 'Frei',
  withdrawn: false,
  inputRule: { attempts: 1, aggregation: 'NONE' },
  grade: null,
} as const;
const SLOTS = [SLOT];

let drafts: GradeDrafts;
const load = vi.fn(() => null);

async function setup(survivesOffline: boolean) {
  const capture = (value: GradeDrafts) => {
    drafts = value;
  };
  function Page() {
    const value = useGradeDrafts({
      url: '/grades',
      prefix: 'test',
      slots: SLOTS,
      loadedAt: 0,
      status: 'lost',
      survivesOffline,
    });
    capture(value);
    return <p>page</p>;
  }
  const Stub = createRoutesStub([{ path: '/', loader: load, Component: Page }]);
  render(<Stub />);
  await screen.findByText('page');
  load.mockClear();
  act(() => drafts.change(SLOT, null, { attempts: [], final: '9.1' }));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('without a connection', () => {
  it('does not reload a page that an error page would replace', async () => {
    await setup(false);
    await act(() => drafts.submit(KEY));
    act(() => drafts.discard(KEY));
    expect(load).not.toHaveBeenCalled();
  });

  it('reloads a page that keeps its data', async () => {
    await setup(true);
    await act(() => drafts.submit(KEY));
    expect(load).toHaveBeenCalledTimes(1);
  });
});
