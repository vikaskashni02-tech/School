require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { apiLimiter } = require('./middleware/rateLimiter');
const db = require('./config/database');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const teacherRoutes = require('./routes/teacher');

const app = express();

// Trust proxy for Render deployment
app.set('trust proxy', 1);

const corsOptions = {
  origin: true, // Allow all origins
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(helmet());
app.use(cors(corsOptions));
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
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);

const PORT = process.env.PORT || 3000;

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
