import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { JudgeLinkCard } from './JudgeLinkCard';

it('shows the QR code on its own when it is clicked', async () => {
  const link = { id: 'l1', ground: 1, apparatus: 'reck', url: 'https://example.com/judge/l1#key' };
  const Stub = createRoutesStub([
    { path: '/', Component: () => <JudgeLinkCard link={link} manualUrl="/manual" /> },
  ]);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <Stub />
    </I18nextProvider>,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^QR-Code: Reck/ }));
  const dialog = within(screen.getByRole('dialog', { name: 'Reck, Wettkampfplatz 1' }));
  expect(dialog.getByRole('img', { name: /Reck/ })).toBeVisible();
});
