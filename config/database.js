const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'srv1874.hstgr.io',
  user: 'u851023220_jagbirbhardwaj',
  password: 'Ritesh@576104',
  database: 'u851023220_jagbirbhardwaj',
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  // Proper connection settings
  connectTimeout: 30000,
  acquireTimeout: 30000,
  // Add SSL settings for better connection
  ssl: false
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

module.exports = pool;