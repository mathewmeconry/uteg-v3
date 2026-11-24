import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, expect, it } from 'vitest';
import { createI18n } from '~/lib/i18n';
import { readDocumentLanguage } from '~/lib/documentLanguage';
import { DocumentLanguageToggle } from './DocumentLanguageToggle';

afterEach(() => {
  document.cookie = 'documentLanguage=; Path=/; Max-Age=0';
});

it('starts with the language of the app and keeps a choice everywhere', async () => {
  render(
    <I18nextProvider i18n={createI18n('en')}>
      <DocumentLanguageToggle />
      <DocumentLanguageToggle />
    </I18nextProvider>,
  );
  const [german] = screen.getAllByRole('radio', { name: 'Deutsch' });
  expect(german).not.toBeChecked();
  expect(readDocumentLanguage(document.cookie)).toBeNull();

  await userEvent.click(german);
  for (const item of screen.getAllByRole('radio', { name: 'Deutsch' })) expect(item).toBeChecked();
  expect(readDocumentLanguage(document.cookie)).toBe('de');

  await userEvent.click(german);
  expect(german).toBeChecked();
});
