import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createI18n } from '~/lib/i18n';
import { RankingExport } from './RankingExport';

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => vi.stubGlobal('ResizeObserver', FakeResizeObserver));
afterEach(() => vi.unstubAllGlobals());

const K1 = { sex: 'FEMALE', category: 'K1' } as const;
const K2 = { sex: 'FEMALE', category: 'K2' } as const;

function template(id: string, data: object = {}) {
  return { id, name: id, isDefault: false, isCoverBroken: false, assignments: [], ...data };
}

async function open(templates: ReturnType<typeof template>[], current: typeof K1 | typeof K2 = K1) {
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RankingExport
        competitionId="c"
        contestId="k"
        groups={[K1, K2]}
        current={current}
        provisional={false}
        templates={templates}
      />
    </I18nextProvider>,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Als PDF drucken' }));
}

/** What the form sends. */
function getParams() {
  const form = screen.getByRole('dialog').querySelector('form')!;
  const data = new FormData(form);
  return { template: data.get('template'), groups: data.getAll('group') };
}

const ASSIGNED = [
  template('Standard', { isDefault: true }),
  template('K1 Vorlage', { assignments: [K1], isCoverBroken: true }),
];

describe('RankingExport', () => {
  it('suggests the template of a single category, or the default one', async () => {
    await open(ASSIGNED);
    expect(getParams()).toEqual({ template: 'K1 Vorlage', groups: ['FEMALE:K1'] });
    await userEvent.click(screen.getByLabelText('K1'));
    await userEvent.click(screen.getByLabelText('K2'));
    expect(getParams()).toEqual({ template: 'Standard', groups: ['FEMALE:K2'] });
  });

  it('uses the template of each category for several', async () => {
    await open(ASSIGNED, K2);
    await userEvent.click(screen.getByLabelText('K1'));
    expect(getParams()).toEqual({ template: 'auto', groups: ['FEMALE:K1', 'FEMALE:K2'] });
    expect(screen.getByRole('combobox')).toHaveTextContent('Automatisch (Vorlage je Kategorie)');
    expect(screen.getByRole('alert')).toHaveTextContent('beschädigt');
    await userEvent.click(screen.getByLabelText('K1'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('has nothing automatic without assignments', async () => {
    await open([template('Standard', { isDefault: true }), template('Andere')]);
    await userEvent.click(screen.getByLabelText('K2'));
    expect(getParams()).toMatchObject({ template: 'Standard' });
  });

  it('works without templates', async () => {
    await open([]);
    expect(getParams()).toEqual({ template: null, groups: ['FEMALE:K1'] });
  });
});
