/** Parallel test runs need a database each, so the name can be set with TEST_DB_NAME. */
export const testDatabaseName = process.env.TEST_DB_NAME || 'uteg_test';

export const testDatabaseServer = 'postgresql://uteg:uteg@localhost:5433';

export const adminDatabaseUrl = `${testDatabaseServer}/postgres`;
export const testDatabaseUrl = `${testDatabaseServer}/${testDatabaseName}`;

/** Tests truncate tables, this keeps them away from real data. */
export function assertTestDatabase(name: string) {
  if (!/^uteg_test\w*$/.test(name)) {
    throw new Error(`"${name}" is not a test database, its name must start with uteg_test`);
  }
}
