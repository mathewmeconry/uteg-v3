import type { Translation } from '../types';
import type de from '../de/display';

export default {
  title: 'Displays',
  screenTitle: 'Display',
  waitingTitle: 'Starting soon',
  waitingText: 'The grades appear as soon as a division starts.',
  next: 'Next',
  pause: 'Pause',
} satisfies Translation<typeof de>;
