import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { describe, expect, it, vi } from 'vitest';
import { defaultRankingTemplate, type RankingTemplateOptions } from '~/lib/domain/rankingTemplate';
import { createI18n } from '~/lib/i18n';
import { TemplateFields } from './TemplateFields';

const onChange = vi.fn<(options: RankingTemplateOptions) => void>();

function Form() {
  const [options, setOptions] = useState(defaultRankingTemplate);
  return (
    <TemplateFields
      options={options}
      onChange={(next) => {
        onChange(next);
        setOptions(next);
      }}
    />
  );
}

function renderForm() {
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <Form />
    </I18nextProvider>,
  );
  return () => onChange.mock.lastCall![0];
}

describe('TemplateFields', () => {
  it('has a control for every option', () => {
    renderForm();
    for (const label of [
      'Titel',
      'Untertitel',
      'Überschrift der Kategorie',
      'Fusszeile',
      'Unterschriften',
      'Ausrichtung',
      'Farbe',
      'Schriftgrösse (pt)',
      'Zeilenhöhe (pt)',
      'Logo anzeigen',
      'Position des Logos',
      'Höhe des Logos (pt)',
      'Wettkampfdatum anzeigen',
      'Seitenzahlen anzeigen',
      'Jede Kategorie auf einer neuen Seite',
      'Vorname',
      'Nachname',
      'Verein',
      'Ort',
      'Jahrgang',
      'Gerätenoten',
      'Total',
      'Auszeichnung',
      'Namen',
      'Nachkommastellen',
      'Medaillen',
      'Beste Noten pro Gerät hervorheben',
      'Nur Medaillen und Auszeichnungen',
    ]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('changes texts, numbers and checkboxes', async () => {
    const options = renderForm();
    await userEvent.type(screen.getByLabelText('Titel'), ' 2026');
    await userEvent.click(screen.getByLabelText('Ort'));
    await userEvent.click(screen.getByLabelText('Nur Medaillen und Auszeichnungen'));
    await userEvent.type(screen.getByLabelText('Unterschriften'), 'A{enter}{enter}B ');
    expect(options()).toMatchObject({
      title: '{competition} 2026',
      columns: { location: true, club: true },
      onlyAwarded: true,
      signatureLabels: ['A', 'B'],
    });
  });

  it('marks invalid values', async () => {
    renderForm();
    const field = screen.getByLabelText('Schriftgrösse (pt)');
    await userEvent.clear(field);
    expect(field).toBeInvalid();
    await userEvent.type(field, '10');
    expect(field).toBeValid();
  });
});
