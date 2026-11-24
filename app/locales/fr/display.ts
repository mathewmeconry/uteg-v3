import type { Translation } from '../types';
import type de from '../de/display';

export default {
  title: 'Affichages des notes',
  screenTitle: 'Affichage des notes',
  waitingTitle: 'C’est bientôt parti',
  waitingText: 'Les notes apparaissent dès qu’une division démarre.',
  next: 'Ensuite',
  pause: 'Pause',
  links: {
    intro: 'Un affichage montre sur un écran les dernières notes d’une place de concours.',
    name: 'Affichage {{code}}',
    empty: 'Pas encore d’affichage',
    emptyText: 'Crée un affichage et ouvre son lien sur l’écran ou le projecteur.',
    create: 'Nouvel affichage',
    createDone: 'Affichage créé',
    qr: 'Code QR',
    qrFor: 'Code QR: {{name}}',
    openFor: 'Ouvrir {{name}}',
    copy: 'Copier le lien',
    copyFor: 'Copier le lien: {{name}}',
    resetFor: 'Réinitialiser le lien: {{name}}',
    resetTitle: 'Réinitialiser le lien?',
    resetText:
      '{{name}}: l’écran avec l’ancien lien n’affichera plus rien et aura besoin du nouveau lien.',
    resetDone: 'Lien réinitialisé',
    deleteFor: 'Supprimer {{name}}',
    deleteTitle: 'Supprimer l’affichage?',
    deleteText: '{{name}}: l’écran avec ce lien n’affichera plus rien.',
    deleteDone: 'Affichage supprimé',
  },
} satisfies Translation<typeof de>;
