import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createI18n } from '~/lib/i18n';
import { SaveStatus, type SaveState } from './SaveStatus';

function show(state: SaveState, message?: string) {
  const onRetry = vi.fn();
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <SaveStatus state={state} message={message} onRetry={onRetry} />
    </I18nextProvider>,
  );
  return onRetry;
}

it.each([
  ['idle', /^$/],
  ['saving', /Wird gespeichert/],
  ['saved', /Gespeichert/],
  ['error', /Nicht gespeichert/],
] as const)('says in one place what happened: %s', (state, text) => {
  show(state);
  expect(screen.getByRole('status')).toHaveTextContent(text);
});

it('offers to try again only after an error', async () => {
  show('saved');
  expect(screen.queryByRole('button')).toBeNull();
});

it('tries again', async () => {
  const onRetry = show('error', 'Keine Verbindung');
  expect(screen.getByRole('status')).toHaveTextContent('Keine Verbindung');
  await userEvent.click(screen.getByRole('button', { name: 'Nochmals versuchen' }));
  expect(onRetry).toHaveBeenCalledOnce();
});
