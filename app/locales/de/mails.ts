export default {
  code: {
    subject: 'Dein UTEG-Code: {{code}}',
    text: 'Hallo\n\nBestätige mit diesem Code deine E-Mail-Adresse für UTEG. Er ist 10 Minuten gültig.\n\n{{code}}\n\nGib ihn niemandem weiter. Falls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.',
  },
  reset: {
    subject: 'Passwort zurücksetzen',
    text: 'Hallo\n\nMit diesem Link kannst du ein neues Passwort für UTEG setzen. Er ist eine Stunde gültig.\n\n{{url}}\n\nFalls du das nicht angefordert hast, kannst du diese E-Mail ignorieren.',
  },
  existing: {
    subject: 'Du hast schon ein Konto',
    text: 'Hallo\n\nJemand wollte mit deiner E-Mail-Adresse ein Konto bei UTEG erstellen. Es gibt aber schon eines. Falls du das warst und das Passwort nicht mehr kennst, kannst du hier ein neues anfordern:\n\n{{url}}\n\nSonst kannst du diese E-Mail ignorieren.',
  },
  invitation: {
    subject: 'Einladung zum Wettkampf «{{competition}}»',
    text: 'Hallo\n\n{{inviter}} hat dich eingeladen, beim Wettkampf «{{competition}}» in UTEG mitzuarbeiten. Erstelle dafür ein Konto mit der Adresse {{email}}:\n\n{{url}}\n\nSobald du die Adresse bestätigt hast, siehst du den Wettkampf.',
  },
};
