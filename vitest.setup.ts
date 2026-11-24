import '@testing-library/jest-dom/vitest';

// Tests never send mails.
vi.mock('~/lib/mail.server', () => ({ sendMail: vi.fn(async () => {}) }));
