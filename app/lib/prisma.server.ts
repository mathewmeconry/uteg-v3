import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '~/generated/prisma/client';

const globalStore = globalThis as typeof globalThis & { __prisma?: PrismaClient };

// Vite reloads this module on changes. Reusing the client keeps the number of connections down.
export const prisma = (globalStore.__prisma ??= new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
}));
