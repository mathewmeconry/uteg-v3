import type { Translation } from '../types';
import type de from '../de/landing';

export default {
  metaTitle: 'UTEG · Logiciel de concours pour la gymnastique aux agrès',
  metaDescription:
    'Logiciel gratuit pour les concours d’agrès: inscriptions depuis Excel, notes sur tablette, affichage en direct dans la salle et classements en PDF.',
  languages: 'Langue',
  title: 'Bien en main jusqu’à la dernière note',
  intro:
    'De l’inscription à la proclamation des résultats: UTEG gère tout le concours, sans feuilles de notes à transporter ni tableaux à recopier.',
  start: 'Créer un concours gratuitement',
  demo: {
    title: 'Fais l’essai',
    text: 'Donne une note à {{name}} au sol.',
    tablet: 'Tablette · {{apparatus}}',
    display: 'Affichage dans la salle',
    save: 'Enregistrer la note',
    provisional: 'provisoire',
    rings: '{{name}}: note {{grade}}, rang {{rank}}',
  },
  import: {
    title: 'Inscriptions depuis Excel',
    text: 'Les sociétés envoient leur fichier, UTEG reconnaît les colonnes et les catégories. Tu vois ce qui ne va pas avant l’importation. Le jour du concours, l’accueil a son propre accès.',
    missing: 'Catégorie manquante',
  },
  live: {
    title: 'Chaque engin, en direct dans la salle',
    text: 'UTEG calcule les changements d’engin et l’ordre de passage. L’affichage montre la dernière note de chaque engin et qui passe ensuite.',
  },
  ranking: {
    title: 'Tout est prêt pour les résultats',
    text: 'Les médailles et les distinctions suivent les règles que tu définis. Le classement s’imprime en PDF, avec logo, page de couverture et modèles par catégorie.',
    competition: 'Coupe Agrès Démo, Aarau',
    logo: 'Ton logo',
  },
  faq: {
    title: 'Questions fréquentes',
    cost: {
      question: 'Combien coûte UTEG?',
      answer: 'Rien. Crée un compte, crée un concours et commence.',
    },
    devices: {
      question: 'De quoi avons-nous besoin dans la salle?',
      answer:
        'De tablettes ou de téléphones avec un navigateur et d’un écran par affichage. Il n’y a rien à installer.',
    },
    judges: {
      question: 'Les juges ont-ils besoin d’un compte?',
      answer: 'Non. Chaque engin a son propre code QR, que tu peux réinitialiser à tout moment.',
    },
    offline: {
      question: 'Que se passe-t-il si le réseau tombe en panne?',
      answer:
        'Les notes restent sur la tablette. Celles qui ont été validées partent automatiquement dès le retour de la connexion.',
    },
    reload: {
      question: 'Et si quelqu’un recharge la page?',
      answer:
        'Les saisies sont toujours là. Sans réseau, elles réapparaissent dès que la page peut être chargée.',
    },
    languages: {
      question: 'Dans quelles langues UTEG existe-t-il?',
      answer: 'En allemand, en français et en anglais, au choix pour chaque personne et tablette.',
    },
  },
  closing: 'À quand ton prochain concours?',
} satisfies Translation<typeof de>;
