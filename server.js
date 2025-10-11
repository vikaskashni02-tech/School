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
  origin: [
    'https://riteshsharma.fun',
    'http://localhost:8080',
    'https://school-3kmf.onrender.com'
  ],
  credentials: true,
  optionsSuccessStatus: 200
};


app.use(helmet());
app.use(compression()); // Enable gzip compression

// Add explicit CORS headers
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://riteshsharma.fun',
    'http://localhost:8080',
    'https://school-3kmf.onrender.com'
  ];
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
});

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
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

// Execute SQL commands from test_schedules.sql
app.post('/api/execute-test-sql', async (req, res) => {
  try {
    // Clear existing test data
    await db.execute('DELETE FROM teacher_schedule WHERE teacher_id IN (1, 2, 3)');
    
    // Execute all INSERT commands from test_schedules.sql
    const testSchedules = [
      [1, 'Monday', '07:20:00', '08:10:00', 'Test Class 1A', 'English'],
      [1, 'Monday', '08:10:00', '09:00:00', 'Test Class 1B', 'English'],
      [1, 'Monday', '09:00:00', '09:50:00', 'Test Class 1C', 'English'],
      [1, 'Monday', '10:10:00', '11:00:00', 'Test Class 1D', 'English'],
      [1, 'Monday', '11:00:00', '11:50:00', 'Test Class 1E', 'English'],
      [2, 'Monday', '12:00:00', '12:50:00', 'Test Class 2A', 'Math'],
      [2, 'Monday', '13:00:00', '13:50:00', 'Test Class 2B', 'Math'],
      [2, 'Monday', '14:00:00', '14:50:00', 'Test Class 2C', 'Math'],
      [2, 'Monday', '15:00:00', '15:50:00', 'Test Class 2D', 'Math'],
      [2, 'Monday', '16:00:00', '16:50:00', 'Test Class 2E', 'Math'],
      [3, 'Monday', '18:00:00', '18:50:00', 'Test Class 3A', 'Science'],
      [3, 'Monday', '19:00:00', '19:50:00', 'Test Class 3B', 'Science'],
      [3, 'Monday', '20:00:00', '20:50:00', 'Test Class 3C', 'Science'],
      [1, 'Tuesday', '07:20:00', '08:10:00', 'Test Class 1A', 'English'],
      [2, 'Tuesday', '14:00:00', '14:50:00', 'Test Class 2C', 'Math'],
      [3, 'Tuesday', '19:00:00', '19:50:00', 'Test Class 3B', 'Science'],
      [1, 'Wednesday', '07:20:00', '08:10:00', 'Test Class 1A', 'English'],
      [2, 'Wednesday', '14:00:00', '14:50:00', 'Test Class 2C', 'Math'],
      [3, 'Wednesday', '19:00:00', '19:50:00', 'Test Class 3B', 'Science'],
      [1, 'Thursday', '07:20:00', '08:10:00', 'Test Class 1A', 'English'],
      [2, 'Thursday', '14:00:00', '14:50:00', 'Test Class 2C', 'Math'],
      [3, 'Thursday', '19:00:00', '19:50:00', 'Test Class 3B', 'Science'],
      [1, 'Friday', '07:20:00', '08:10:00', 'Test Class 1A', 'English'],
      [2, 'Friday', '14:00:00', '14:50:00', 'Test Class 2C', 'Math'],
      [3, 'Friday', '19:00:00', '19:50:00', 'Test Class 3B', 'Science'],
      [1, 'Saturday', '07:20:00', '08:10:00', 'Test Class 1A', 'English'],
      [2, 'Saturday', '14:00:00', '14:50:00', 'Test Class 2C', 'Math'],
      [1, 'Sunday', '07:20:00', '08:10:00', 'Test Class 1A', 'English'],
      [2, 'Sunday', '14:00:00', '14:50:00', 'Test Class 2C', 'Math']
    ];
    
    for (const schedule of testSchedules) {
      await db.execute(
        'INSERT INTO teacher_schedule (teacher_id, day, period_start, period_end, class_name, subject) VALUES (?, ?, ?, ?, ?, ?)',
        schedule
      );
    }
    
    res.json({
      message: 'Test schedules executed successfully',
      totalSchedules: testSchedules.length,
      note: 'All commands from test_schedules.sql executed'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
    origin: true, // Allow all origins for Socket.IO
    credentials: true
  }
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
