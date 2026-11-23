/** Parallel test runs need a database each, so the name can be set with TEST_DB_NAME. */
export const testDatabaseName = process.env.TEST_DB_NAME || 'uteg_test';

const SERVER_URL = 'postgresql://uteg:uteg@localhost:5433';

export const adminDatabaseUrl = `${SERVER_URL}/postgres`;
export const testDatabaseUrl = `${SERVER_URL}/${testDatabaseName}`;

/** Tests truncate tables, this keeps them away from real data. */
export function assertTestDatabase(name: string) {
  if (!/^uteg_test\w*$/.test(name)) {
    throw new Error(`"${name}" is not a test database, its name must start with uteg_test`);
  }
}
