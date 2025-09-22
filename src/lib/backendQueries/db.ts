import sql, { type ConnectionPool } from 'mssql';
import { error } from '@sveltejs/kit';
import { dev } from '$app/environment';

// Extend the globalThis type to inform TypeScript about our custom property.
declare global {
  // We allow it to be undefined initially.
  var _dbConnectionPool: Promise<ConnectionPool> | undefined;
}

const dbConfig = {
  user: 'sa',
  password: 'ichBinAdmin@123',
  server: 'localhost',
  database: 'pureenergyworks',
  options: {
    trustServerCertificate: true
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 15000
  }
};

/**
 * Creates and returns a single connection pool promise.
 */
function createConnectionPool(): Promise<ConnectionPool> {
  console.log("Attempting to create a new MSSQL connection pool...");
  return sql.connect(dbConfig).then(pool => {
    console.log("✅ Successfully connected to MSSQL!");
    return pool;
  }).catch(err => {
    console.error("❌ Database connection failed:", err);
    throw error(500, "Could not connect to the database.");
  });
}

// In development, we store the connection promise on the global object to
// prevent it from being re-created on every HMR update.
if (dev && !globalThis._dbConnectionPool) {
  globalThis._dbConnectionPool = createConnectionPool();
}

// This is the core logic:
// - In production, it creates the pool.
// - In development, it reuses the pool from the global object if it exists,
//   or creates it if it doesn't.
const poolPromise = globalThis._dbConnectionPool ?? createConnectionPool();

// We await the promise here so that any module importing 'db'
// gets the resolved ConnectionPool instance directly.
export const db = await poolPromise;