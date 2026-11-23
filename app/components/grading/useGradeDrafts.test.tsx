import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
const send = vi.fn<typeof fetch>();
const unreachable = () => Promise.reject(new TypeError('Failed to fetch'));

async function setup() {
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
  vi.stubGlobal('fetch', send);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a grade that was not answered', () => {
  it('does not reload the page without a connection, an error page would replace it', async () => {
    send.mockImplementation(unreachable);
    await setup();
    await act(() => drafts.submit(KEY));
    act(() => drafts.discard(KEY));
    await act(() => Promise.resolve());
    expect(load).not.toHaveBeenCalled();
  });

  it('reloads the page when the server is there, the grade may be saved', async () => {
    send.mockImplementation((url) => (url === '/healthz' ? fetched() : unreachable()));
    await setup();
    await act(() => drafts.submit(KEY));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });
});

function fetched() {
  return Promise.resolve(new Response('ok'));
}
