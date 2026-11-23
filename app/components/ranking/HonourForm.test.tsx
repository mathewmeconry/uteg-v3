import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import { createI18n } from '~/lib/i18n';
import { HonourForm } from './HonourForm';

function renderForm() {
  const router = createMemoryRouter([
    {
      path: '/',
      action: () => ({ errors: { percent: 'Zahl von 0 bis 100' } }),
      element: <HonourForm sex="FEMALE" category="K5" percent={33.5} hint="4 von 12" />,
    },
  ]);
  render(
    <I18nextProvider i18n={createI18n('de')}>
      <RouterProvider router={router} />
    </I18nextProvider>,
  );
}

const save = () => screen.queryByRole('button', { name: 'Speichern' });

it('only offers to save another number', async () => {
  renderForm();
  const field = screen.getByLabelText('Auszeichnungen (%)');
  expect(save()).toBeNull();
  await userEvent.clear(field);
  expect(save()).toBeInTheDocument();
  await userEvent.type(field, '33,50');
  expect(save()).toBeNull();
});

it('shows the error until the value changes', async () => {
  renderForm();
  const field = screen.getByLabelText('Auszeichnungen (%)');
  await userEvent.type(field, '00');
  await userEvent.clear(field);
  await userEvent.type(field, '101');
  await userEvent.click(save()!);
  expect(await screen.findByRole('alert')).toHaveTextContent('Zahl von 0 bis 100');
  expect(field).toBeInvalid();
  await userEvent.type(field, '{Backspace}');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('4 von 12')).toBeInTheDocument();
});
