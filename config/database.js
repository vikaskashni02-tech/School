const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'srv1874.hstgr.io',
  user: 'u851023220_jagbirbhardwaj',
  password: 'Ritesh@576104',
  database: 'u851023220_jagbirbhardwaj',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
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
    console.error('❌ Database connection test failed:', error);
  }
};

testConnection();

module.exports = pool;