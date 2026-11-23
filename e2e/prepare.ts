/** Runs before the server of the end-to-end tests: a database with nothing but an account. */
import { once } from 'node:events';
import { createServer } from 'node:net';
import { hashPassword } from 'better-auth/crypto';
import { prisma } from '~/lib/prisma.server';
import setupDatabase from '~/tests/globalSetup';
import { createUser, truncateTables } from '~/tests/helpers';
import { ACCOUNT } from './account';

// Fails when the port is in use: another run is using the database.
const probe = createServer().listen(Number(process.env.PORT));
await once(probe, 'listening');
probe.close();

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
