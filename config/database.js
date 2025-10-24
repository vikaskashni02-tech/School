require('dotenv').config();
const mysql = require('mysql2/promise');

const connectTimeoutEnv = process.env.DB_CONNECT_TIMEOUT;
const connectTimeoutMs = Number(connectTimeoutEnv);

const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  acquireTimeout: 30000,
  timeout: 30000,
  connectTimeout: 20000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  reconnect: true,
  multipleStatements: false,
  charset: 'utf8mb4',
  timezone: '+00:00',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
};

// Override connectTimeout if specified in env
if (!Number.isNaN(connectTimeoutMs) && connectTimeoutMs > 0) {
  poolConfig.connectTimeout = connectTimeoutMs;
}

const pool = mysql.createPool(poolConfig);

pool.on('connection', (_connection) => {
  console.log('✅ New database connection established');
});

pool.on('error', (err) => {
  console.error('Database pool error:', err);
  if (err.code === 'PROTOCOL_CONNECTION_LOST') {
    console.log('Database connection lost, attempting to reconnect...');
  }
});

// Test database connection on startup
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connection test successful');
    connection.release();
  } catch (error) {
    console.error('❌ Database connection test failed:', error.message);
    console.error('Error code:', error.code);
    console.error('This might be due to:');
    console.error('1. Database server is down');
    console.error('2. Wrong credentials');
    console.error('3. Firewall blocking connection');
    console.error('4. Network issues');
  }
};

// Test connection after a short delay to allow server to start
setTimeout(testConnection, 2000);

// Wrapper function to handle database queries with retry logic
const executeQuery = async (query, params = []) => {
  let retries = 1;
  while (retries > 0) {
    try {
      const result = await pool.execute(query, params);
      return result;
    } catch (error) {
      retries--;
      console.error(`Database query failed:`, error.message);
      
      if (retries === 0) {
        throw error;
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

// Batch query execution for multiple queries
const executeBatch = async (queries) => {
  const connection = await pool.getConnection();
  try {
    const results = [];
    for (const { query, params } of queries) {
      const [result] = await connection.execute(query, params || []);
      results.push(result);
    }
    return results;
  } finally {
    connection.release();
  }
};

module.exports = {
  pool,
  execute: executeQuery,
  executeBatch
};
