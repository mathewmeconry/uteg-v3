import type { Translation } from '../types';
import type de from '../de/landing';

export default {
  metaTitle: 'UTEG · Competition software for Geräteturnen',
  metaDescription:
    'Free software for Swiss Geräteturnen competitions: entries from Excel, grades on a tablet, a live display in the hall and rankings as PDF.',
  languages: 'Language',
  title: 'A firm grip to the very last grade',
  intro:
    'From registration to the award ceremony: UTEG runs the whole competition, with no score sheets to carry and no tables to retype.',
  start: 'Create a competition for free',
  demo: {
    title: 'Try it',
    text: 'Give {{name}} a grade on floor.',
    tablet: 'Tablet · {{apparatus}}',
    display: 'Display in the hall',
    save: 'Save grade',
    provisional: 'provisional',
    rings: '{{name}}: grade {{grade}}, rank {{rank}}',
  },
  import: {
    title: 'Entries from Excel',
    text: 'Clubs send their file, UTEG recognises columns and categories. You see what is wrong before the import. On the day, the check-in has its own access.',
    missing: 'No category',
  },
  live: {
    title: 'Every apparatus, live in the hall',
    text: 'UTEG works out the rotations and the starting order. The display shows the newest grade of every apparatus and who is next.',
  },
  ranking: {
    title: 'Ready for the award ceremony',
    text: 'Medals and awards follow the rules you set. Print the ranking as PDF, with a logo, a cover page and templates per category.',
    competition: 'Demo Gerätecup, Aarau',
    logo: 'Your logo',
  },
  faq: {
    title: 'Frequently asked questions',
    cost: {
      question: 'What does UTEG cost?',
      answer: 'Nothing. Create an account, create a competition and start.',
    },
    devices: {
      question: 'What do we need in the hall?',
      answer:
        'Tablets or phones with a browser, and a screen for each display. There is nothing to install.',
    },
    judges: {
      question: 'Do judges need an account?',
      answer: 'No. Every apparatus has its own QR code, which you can reset at any time.',
    },
    offline: {
      question: 'What happens when the network fails?',
      answer:
        'Grades stay on the tablet. Submitted ones are sent automatically once the connection is back.',
    },
    reload: {
      question: 'And if someone reloads the page?',
      answer:
        'What was typed is still there. Without a network it reappears as soon as the page can be loaded.',
    },
    languages: {
      question: 'Which languages does UTEG speak?',
      answer: 'German, French and English, set for each person and each tablet.',
    },
  },
  closing: 'Ready for your next competition',
} satisfies Translation<typeof de>;
