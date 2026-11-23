import type { Translation } from '../types';
import type de from '../de/judging';

export default {
  title: 'Judging',
  gradingTitle: 'Grading',
  judgesTitle: 'Judges',
  linkInvalidTitle: 'Invalid link',
  linkInvalidText: 'The link was reset. Scan the current QR code.',
  links: {
    intro:
      'Each apparatus has a link for its tablet. Anyone with the link can enter grades there. Only pass it on to the judges.',
    grounds: 'Grounds',
    qr: 'QR code: {{name}}',
    open: 'Open {{name}}',
    copy: 'Copy link',
    copyFor: 'Copy link: {{name}}',
    manual: 'Manual (PDF)',
    manualFor: 'Manual (PDF): {{name}}',
    manualGround: 'Manuals ground {{number}} (PDF)',
    resetFor: 'Reset link: {{name}}',
    resetTitle: 'Reset link?',
    resetText:
      '{{name}}: The tablet with the old link is locked out at once. It has to scan the new QR code. Printed manuals become invalid.',
    resetDone: 'Link reset',
    resetAll: 'Reset all',
    resetAllTitle: 'Reset all links?',
    resetAllText:
      'All tablets on all grounds are locked out at once and have to scan the new QR codes. Printed manuals become invalid.',
    resetAllDone: 'Links reset',
    resetGround: 'Reset ground {{number}}',
    resetGroundTitle: 'Reset all links of ground {{number}}?',
    resetGroundText:
      'All tablets of this ground are locked out at once and have to scan the new QR codes. Printed manuals become invalid.',
  },
} satisfies Translation<typeof de>;
