import type { Translation } from '../types';
import type de from '../de/mails';

export default {
  code: {
    subject: 'Ton code UTEG: {{code}}',
    title: 'Confirmer l’adresse e-mail',
    text: 'Saisis ce code dans UTEG. Il est valable 10 minutes.',
    note: 'Ne transmets ce code à personne. Si tu ne l’as pas demandé, tu peux ignorer cet e-mail.',
  },
  reset: {
    subject: 'Réinitialiser le mot de passe',
    title: 'Réinitialiser le mot de passe',
    text: 'Définis un nouveau mot de passe pour UTEG. Le lien est valable une heure.',
    button: 'Définir un nouveau mot de passe',
    note: 'Si tu n’as pas fait cette demande, tu peux ignorer cet e-mail.',
  },
  existing: {
    subject: 'Tu as déjà un compte',
    title: 'Tu as déjà un compte',
    text: 'Quelqu’un a voulu créer un compte UTEG avec ton adresse e-mail, mais il en existe déjà un. Si c’était toi et que tu ne connais plus le mot de passe, tu peux en demander un nouveau.',
    button: 'Réinitialiser le mot de passe',
    note: 'Si ce n’était pas toi, tu peux ignorer cet e-mail.',
  },
  invitation: {
    subject: 'Invitation au concours «{{competition}}»',
    title: 'Invitation au concours «{{competition}}»',
    text: '{{inviter}} t’invite à collaborer dans UTEG. Pour cela, crée un compte avec l’adresse {{email}}.',
    button: 'Créer un compte',
    note: 'Tu verras le concours dès que tu auras confirmé l’adresse.',
  },
} satisfies Translation<typeof de>;
