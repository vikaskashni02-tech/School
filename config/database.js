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
  keepAliveInitialDelay: 0
});

pool.on('connection', (connection) => {
  console.log('✅ New database connection established');
});

module.exports = pool;