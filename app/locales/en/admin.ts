import type { Translation } from '../types';
import type de from '../de/admin';

export default {
  title: 'Administration',
  users: 'Accounts',
  competitions: 'Competitions',
  starters: 'Starters',
  grades: 'Grades',
  unverifiedCount: '{{count}} not verified',
  searchUsers: 'Email or competition',
  searchCompetitions: 'Competition, location or owner',
  today: 'Today',
  admin: 'Admin',
  unverified: 'Not verified',
  registered: 'Registered on {{date}}',
  lastActive: 'last active on {{date}}',
  signedOut: 'not signed in',
  resetPassword: {
    title: 'Send link for a new password',
    label: 'Send {{email}} a link for a new password',
    confirm: 'Send {{email}} a link for a new password?',
    text: 'The current password works until a new one is set.',
    button: 'Send link',
    done: 'The link is being sent.',
  },
  signOut: {
    title: 'Log out everywhere',
    label: 'Log out {{email}} everywhere',
    confirm: 'Log out {{email}} everywhere?',
    text: 'The person has to log in again on all devices.',
    button: 'Log out',
    done: 'The person was logged out everywhere.',
  },
  delete: {
    title: 'Delete account',
    label: 'Delete the account of {{email}}',
    confirm: 'Delete the account of {{email}}?',
    text: 'The person loses access to all their competitions. The competitions remain. This cannot be undone.',
    done: 'The account was deleted.',
  },
} satisfies Translation<typeof de>;
