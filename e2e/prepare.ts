/** Runs before the server of the end-to-end tests: a database with nothing but an account. */
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '~/lib/prisma.server';
import setupDatabase from '~/tests/globalSetup';
import { createUser, truncateTables } from '~/tests/helpers';
import { ACCOUNT } from './account';

await setupDatabase();
await truncateTables();
const { id } = await createUser({ email: ACCOUNT.email });
await prisma.account.create({
  data: {
    id,
    accountId: id,
    userId: id,
    providerId: 'credential',
    password: await hashPassword(ACCOUNT.password),
  },
});
await prisma.$disconnect();
