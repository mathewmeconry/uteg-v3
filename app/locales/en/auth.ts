import type { Translation } from '../types';
import type de from '../de/auth';

export default {
  loginTitle: 'Log in',
  registerTitle: 'Create account',
  noAccount: 'No account yet?',
  haveAccount: 'Already have an account?',
  repeatPassword: 'Repeat password',
  passwordHint: 'At least 8 characters',
  errors: {
    email: 'Enter a valid email address',
    passwordLength: 'The password needs 8 to 128 characters',
    passwordMismatch: 'The passwords do not match',
    credentials: 'Email or password is wrong',
    registerFailed: 'The account could not be created. If you already have one, log in.',
    currentPassword: 'The current password is wrong',
    emailFailed: 'This email address cannot be used',
  },
  profile: {
    title: 'Profile',
    emailTitle: 'Email address',
    passwordTitle: 'Change password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    passwordChanged: 'Password changed. Other devices were logged out.',
    emailChanged: 'Email address changed',
    languageChanged: 'Language changed',
  },
} satisfies Translation<typeof de>;
