import type { Translation } from '../types';
import type de from '../de/mails';

export default {
  code: {
    subject: 'Your UTEG code: {{code}}',
    title: 'Confirm email address',
    text: 'Enter this code in UTEG. It is valid for 10 minutes.',
    note: 'Do not share the code with anyone. If you did not request it, you can ignore this email.',
  },
  reset: {
    subject: 'Reset password',
    title: 'Reset password',
    text: 'Set a new password for UTEG. The link is valid for one hour.',
    button: 'Set new password',
    note: 'If you did not request this, you can ignore this email.',
  },
  existing: {
    subject: 'You already have an account',
    title: 'You already have an account',
    text: 'Somebody tried to create a UTEG account with your email address, but there is one already. If that was you and you no longer know the password, you can request a new one.',
    button: 'Reset password',
    note: 'If that was not you, you can ignore this email.',
  },
  invitation: {
    subject: 'Invitation to the competition “{{competition}}”',
    title: 'Invitation to the competition “{{competition}}”',
    text: '{{inviter}} invited you to work together in UTEG. Create an account with the address {{email}}.',
    button: 'Create account',
    note: 'You see the competition as soon as you have confirmed the address.',
  },
} satisfies Translation<typeof de>;
