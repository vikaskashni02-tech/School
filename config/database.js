const mysql = require('mysql2/promise');

// Hardcoded database credentials (not using environment variables)
const pool = mysql.createPool({
  host: 'srv1874.hstgr.io',
  user: 'u851023220_jagbirbhardwaj',
  password: 'Ritesh@576104',
  database: 'u851023220_jagbirbhardwaj',
  waitForConnections: true,
  connectionLimit: 3,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  connectTimeout: 15000,
  // Some providers require SSL; disable cert verification to avoid handshake issues
  // If your DB strictly requires SSL with CA, replace with: ssl: { ca: '...cert...'}
  ssl: { rejectUnauthorized: false }
});

pool.on('connection', (connection) => {
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
  let retries = 3;
  while (retries > 0) {
    try {
      const result = await pool.execute(query, params);
      return result;
    } catch (error) {
      retries--;
      console.error(`Database query failed, ${retries} retries left:`, error.message);
      
      if (retries === 0) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

module.exports = {
  pool,
  execute: executeQuery
};
