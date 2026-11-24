import type { Translation } from '../types';
import type de from '../de/mails';

export default {
  code: {
    subject: 'Your UTEG code: {{code}}',
    text: 'Hello\n\nConfirm your email address for UTEG with this code. It is valid for 10 minutes.\n\n{{code}}\n\nDo not share it with anyone. If you did not request this, you can ignore this email.',
  },
  reset: {
    subject: 'Reset password',
    text: 'Hello\n\nUse this link to set a new password for UTEG. It is valid for one hour.\n\n{{url}}\n\nIf you did not request this, you can ignore this email.',
  },
  existing: {
    subject: 'You already have an account',
    text: 'Hello\n\nSomebody tried to create a UTEG account with your email address, but there is one already. If that was you and you no longer know the password, you can request a new one here:\n\n{{url}}\n\nOtherwise you can ignore this email.',
  },
  invitation: {
    subject: 'Invitation to the competition “{{competition}}”',
    text: 'Hello\n\n{{inviter}} invited you to work on the competition “{{competition}}” in UTEG. Create an account with the address {{email}}:\n\n{{url}}\n\nYou see the competition as soon as you have confirmed the address.',
  },
} satisfies Translation<typeof de>;
