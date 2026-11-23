import type { Translation } from '../types';
import type de from '../de/ranking';

export default {
  title: 'Ranking',
  rank: 'Rank',
  total: 'Total',
  award: 'Award',
  awards: {
    GOLD: 'Gold',
    SILVER: 'Silver',
    BRONZE: 'Bronze',
    HONOUR: 'Honour',
  },
  best: 'Best grade',
  runningTitle: 'Divisions are still running',
  runningText: 'The ranking is not complete.',
  provisionalText: 'The ranking is provisional and can still change.',
  provisional: 'Provisional (include running divisions)',
  missingGrades_one: '{{count}} grade is missing and counts as 0',
  missingGrades_other: '{{count}} grades are missing and count as 0',
  emptyTitle: 'No results yet',
  emptyText: 'The ranking appears here as soon as a division of this category has ended.',
  lastUpdated: 'Last grade: {{date}}',
  honourPercent: 'Honours (%)',
  honourHint_one: '{{quota}} of {{count}} person',
  honourHint_other: '{{quota}} of {{count}} people',
  honourInvalid: 'A number from 0 to 100',
  honourSaved: 'Honours saved',
  export: {
    button: 'PDF',
    title: 'Ranking as PDF',
    text: 'Choose the categories and the template.',
    template: 'Template',
    noneSelected: 'Choose at least one category.',
    create: 'Create PDF',
  },
} satisfies Translation<typeof de>;
