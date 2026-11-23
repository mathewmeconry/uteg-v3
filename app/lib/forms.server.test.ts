import { z } from 'zod';
import { parseForm } from './forms.server';

describe('parseForm', () => {
  const schema = z.object({ id: z.string().min(1, 'missing') });
  const parse = (id: string) => {
    const formData = new FormData();
    formData.set('id', id);
    return parseForm(formData, schema);
  };

  it('returns the values or the errors', () => {
    expect(parse('a')).toEqual({ data: { id: 'a' } });
    expect(parse('')).toEqual({ errors: { id: 'missing' } });
  });

  it('rejects NUL, which the database cannot take', () => {
    expect(() => parse('a\0')).toThrow(expect.objectContaining({ init: { status: 400 } }));
  });
});
