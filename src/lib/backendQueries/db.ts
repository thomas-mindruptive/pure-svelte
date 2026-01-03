import sql, { type ConnectionPool } from 'mssql';

/** Detect dev mode without SvelteKit dependency */
const dev = process.env.NODE_ENV !== 'production';

// Extend the globalThis type to inform TypeScript about our custom property.
declare global {
  // We allow it to be undefined initially.
  var _dbConnectionPool: Promise<ConnectionPool> | undefined;
}
/**
 * ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️
 * SQLEXPRESS configured with fixed port 1433
 * TCP/IP enabled in SQL Server Config Manager
 * ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️ ⚠️
 */
const dbConfig = {
  user: 'sa',
  password: 'pw12345',
  server: 'localhost',  // Port 1433 is default
  database: 'pureenergyworks',
  options: {
    trustServerCertificate: true,
    encrypt: false,  // Für lokale Entwicklung
    enableArithAbort: true
  },
  pool: {
    max: 20,
    min: 5,
    idleTimeoutMillis: 15000
  },
  connectionTimeout: 15000,
  requestTimeout: 15000
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
    throw new Error("Could not connect to the database.");
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