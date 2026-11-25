import type { Translation } from '../types';
import type de from '../de/admin';

export default {
  title: 'Administration',
  users: 'Comptes',
  competitions: 'Concours',
  starters: 'Gymnastes',
  grades: 'Notes',
  unverifiedCount: '{{count}} à confirmer',
  searchUsers: 'E-mail ou concours',
  searchCompetitions: 'Concours, lieu ou propriétaire',
  today: 'Aujourd’hui',
  admin: 'Admin',
  unverified: 'Non confirmé',
  registered: 'Compte créé le {{date}}',
  lastActive: 'dernière activité le {{date}}',
  signedOut: 'sans session ouverte',
  resetPassword: {
    title: 'Envoyer un lien pour un nouveau mot de passe',
    label: 'Envoyer à {{email}} un lien pour un nouveau mot de passe',
    confirm: 'Envoyer à {{email}} un lien pour un nouveau mot de passe?',
    text: 'Le mot de passe actuel reste valable jusqu’à ce qu’un nouveau soit défini.',
    button: 'Envoyer le lien',
    done: 'Le lien est en cours d’envoi.',
  },
  signOut: {
    title: 'Déconnecter partout',
    label: 'Déconnecter {{email}} partout',
    confirm: 'Déconnecter {{email}} partout?',
    text: 'La personne devra se reconnecter sur tous ses appareils.',
    button: 'Déconnecter',
    done: 'La personne a été déconnectée partout.',
  },
  delete: {
    title: 'Supprimer le compte',
    label: 'Supprimer le compte de {{email}}',
    confirm: 'Supprimer le compte de {{email}}?',
    text: 'La personne perd l’accès à tous ses concours. Les concours sont conservés. Cette action est irréversible.',
    done: 'Le compte a été supprimé.',
  },
} satisfies Translation<typeof de>;
