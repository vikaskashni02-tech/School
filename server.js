require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { apiLimiter } = require('./middleware/rateLimiter');
const { auth } = require('./middleware/auth');
const db = require('./config/database');
const { getDashboardData } = require('./controllers/optimizedController');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');
const { cacheMiddleware } = require('./middleware/cache');

const app = express();

// Trust proxy for Render deployment
app.set('trust proxy', 1);

const corsOptions = {
  origin: ['http://localhost:3000', 'https://riteshsharma.fun'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};


app.use(helmet());
app.use(compression()); // Enable gzip compression

// Enhanced CORS middleware
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = ['http://localhost:3000', 'https://riteshsharma.fun'];
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '50mb' })); // Large limit for requests
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Large limit for requests
app.use(apiLimiter);

// Health check
app.get('/health', async (_req, res) => {
  try {
    // Test database connection with timeout
    const startTime = Date.now();
    await db.execute('SELECT 1');
    const responseTime = Date.now() - startTime;
    
    res.json({ 
      status: 'ok', 
      database: 'connected',
      responseTime: `${responseTime}ms`,
      timestamp: new Date().toISOString(),
      fallback: false
    });
  } catch (error) {
    res.json({ 
      status: 'degraded', 
      database: 'timeout',
      error: error.message,
      timestamp: new Date().toISOString(),
      fallback: true,
      message: 'Database unavailable, using fallback authentication'
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/admin', cacheMiddleware('short'), adminRoutes);
app.use('/api/teacher', cacheMiddleware('short'), teacherRoutes);

// Test endpoint to debug authentication
app.get('/api/test-auth', auth, (req, res) => {
  res.json({ 
    message: 'Authentication working', 
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Test database endpoint
app.get('/api/test-db', async (req, res) => {
  try {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 8); // 24-hour format HH:MM:SS
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentTime12 = now.toLocaleTimeString('en-US', { hour12: true });
    const currentTime24 = now.toLocaleTimeString('en-US', { hour12: false });
    
    // Get all schedules for today
    const [allSchedules] = await db.execute(`
      SELECT ts.*, t.name as teacher_name
      FROM teacher_schedule ts
      JOIN teachers t ON ts.teacher_id = t.id
      WHERE ts.day = ?
      ORDER BY ts.period_start
    `, [currentDay]);
    
    // Get current periods
    const [currentPeriods] = await db.execute(`
      SELECT ts.*, t.name as teacher_name
      FROM teacher_schedule ts
      JOIN teachers t ON ts.teacher_id = t.id
      WHERE ts.day = ? 
      AND TIME(?) >= TIME(ts.period_start) 
      AND TIME(?) < TIME(ts.period_end)
    `, [currentDay, currentTime, currentTime]);
    
    res.json({
      currentTime24Hour: currentTime,
      currentTime12Hour: currentTime12,
      currentTime24Format: currentTime24,
      currentDay,
      allSchedulesToday: allSchedules,
      currentActivePeriods: currentPeriods,
      message: `Current time (24h): ${currentTime}, Current time (12h): ${currentTime12}, Day: ${currentDay}`,
      explanation: 'Database stores time in 24-hour format. 10:10:00 = 10:10 AM, 22:10:00 = 10:10 PM'
    });
  } catch (error) {
    res.status(500).json({
      error: error.message,
      code: error.code
    });
  }
});

// Optimized dashboard endpoint
app.get('/api/dashboard', auth, cacheMiddleware('short'), getDashboardData);

const PORT = process.env.PORT || 8000;

app.use((err, _req, res, _next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
  });
});

const server = app.listen(PORT, () => {
  console.log('----------------------------------------');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 Environment: development`);
  console.log(`🌐 API endpoints:`);
  console.log('   /api/auth');
  console.log('   /api/admin');
  console.log('   /api/teacher');
  console.log('----------------------------------------');
});

const io = require('socket.io')(server, {
  cors: {
    origin: ['http://localhost:3000', 'https://riteshsharma.fun'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['polling', 'websocket'],
  pingTimeout: 60000,
  pingInterval: 25000,
  upgradeTimeout: 30000,
  allowEIO3: true
});

io.on('connection', (socket) => {
  console.log('✅ Client connected:', socket.id);
  
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

app.set('io', io);

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
