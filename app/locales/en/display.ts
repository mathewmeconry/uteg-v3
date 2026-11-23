import type { Translation } from '../types';
import type de from '../de/display';

export default {
  title: 'Displays',
  screenTitle: 'Display',
  waitingTitle: 'Starting soon',
  waitingText: 'The grades appear as soon as a division starts.',
  next: 'Next',
  pause: 'Pause',
  links: {
    intro: 'A display shows the latest grades of a ground on a screen.',
    name: 'Display {{code}}',
    empty: 'No displays yet',
    create: 'New display',
    createDone: 'Display created',
    display: 'Display',
    actions: 'Actions',
    qr: 'QR code',
    qrFor: 'QR code: {{name}}',
    openFor: 'Open {{name}}',
    copy: 'Copy link',
    copyFor: 'Copy link: {{name}}',
    resetFor: 'Reset link: {{name}}',
    resetTitle: 'Reset link?',
    resetText: '{{name}}: The screen with the old link goes blank and needs the new link.',
    resetDone: 'Link reset',
    deleteFor: 'Delete {{name}}',
    deleteTitle: 'Delete display?',
    deleteText: '{{name}}: The screen with this link goes blank.',
    deleteDone: 'Display deleted',
  },
} satisfies Translation<typeof de>;
