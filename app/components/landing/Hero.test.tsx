import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { createRoutesStub } from 'react-router';
import { createI18n } from '~/lib/i18n';
import { Hero } from './Hero';

function setup() {
  const Stub = createRoutesStub([{ path: '/', Component: () => <Hero language="de" /> }]);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <Stub />
    </I18nextProvider>,
  );
}

function save(text: string) {
  fireEvent.change(screen.getByLabelText('Note'), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Note speichern' }));
}

const ranking = () => screen.getAllByRole('listitem').map((item) => item.textContent);

it('shows a saved grade on the rings, the display and in the ranking', () => {
  setup();
  expect(ranking()[3]).toContain('Lea Brunner');
  save('9,45');
  expect(screen.getByRole('img', { name: 'Lea Brunner: Note 9.45, Rang 1' })).toBeVisible();
  expect(screen.getByText('Gespeichert: 9.45')).toBeVisible();
  expect(ranking()[0]).toContain('Lea Brunner');
  expect(ranking()[0]).toContain('37.10');
});

it('shares the rank of the same total', () => {
  setup();
  save('9.35');
  expect(screen.getByRole('img', { name: 'Lea Brunner: Note 9.35, Rang 1' })).toBeVisible();
  expect(ranking().map((text) => text![0])).toEqual(['1', '1', '3', '4']);
});

it('refuses what is not a grade', () => {
  setup();
  save('11');
  expect(screen.getByText('Die Note muss zwischen 0 und 10 liegen.')).toBeVisible();
  expect(ranking()[3]).toContain('Lea Brunner');
});
