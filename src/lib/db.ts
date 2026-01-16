import { sql, db, VercelPoolClient } from '@vercel/postgres';

/**
 * Vercel Postgres Database Connection
 * 
 * Environment variables required:
 * - POSTGRES_URL: Connection string for Vercel Postgres
 * - POSTGRES_PRISMA_URL: Prisma-compatible connection string (optional)
 * - POSTGRES_URL_NON_POOLING: Non-pooling connection string (optional)
 * - POSTGRES_USER: Database username
 * - POSTGRES_HOST: Database host
 * - POSTGRES_PASSWORD: Database password
 * - POSTGRES_DATABASE: Database name
 */

// Re-export sql template literal for direct queries
export { sql };

// Export client type for external use
export type { VercelPoolClient };

// Get a client from the pool for transactions
export async function getClient(): Promise<VercelPoolClient> {
  const client = await db.connect();
  return client;
}

// Execute a query with automatic connection handling
export async function query<T>(
  queryText: string,
  params?: unknown[]
): Promise<T[]> {
  try {
    const result = await sql.query(queryText, params);
    return result.rows as T[];
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Execute a transaction with multiple queries
export async function transaction<T>(
  callback: (client: VercelPoolClient) => Promise<T>
): Promise<T> {
  const client = await db.connect();
  
  try {
    await client.sql`BEGIN`;
    const result = await callback(client);
    await client.sql`COMMIT`;
    return result;
  } catch (error) {
    await client.sql`ROLLBACK`;
    console.error('Transaction error:', error);
    throw error;
  }
}

// Health check for database connection
export async function healthCheck(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}
