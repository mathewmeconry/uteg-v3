import type { Translation } from '../types';
import type de from '../de/judging';

export default {
  title: 'Judging',
  gradingTitle: 'Grading',
  judgesTitle: 'Judges',
  linkInvalidTitle: 'Invalid link',
  linkInvalidText: 'The link was reset. Scan the current QR code.',
} satisfies Translation<typeof de>;
