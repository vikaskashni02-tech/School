const db = require('../config/database');
const { clearCache } = require('../middleware/cache');

// Optimized endpoint for dashboard data
const getDashboardData = async (req, res) => {
  try {
    console.log('Dashboard request - req.user:', req.user);
    
    if (!req.user || !req.user.id) {
      return res.status(401).json({ message: 'User not authenticated' });
    }
    
    const userId = req.user.id;
    const userRole = req.user.role;
    console.log('Dashboard request - userId:', userId, 'userRole:', userRole);
    
    // Test database connection first
    await db.execute('SELECT 1');
    console.log('Database connection test passed');
    
    if (userRole === 'admin') {
      // Get current time in 24-hour format to match database
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 8); // HH:MM:SS format (24-hour)
      const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' });
      
      console.log('Current time (24-hour):', currentTime, 'Current day:', currentDay);
      console.log('Looking for periods where:', currentTime, 'is between period_start and period_end');
      
      // Admin dashboard with real stats using proper time comparison
      const [results] = await db.execute(`
        SELECT 
          (SELECT COUNT(*) FROM teachers WHERE status = 'active') as activeTeachers,
          (SELECT COUNT(*) FROM teacher_schedule ts 
           WHERE ts.day = ? AND TIME(?) >= TIME(ts.period_start) AND TIME(?) < TIME(ts.period_end)) as currentClasses,
          (SELECT COUNT(*) FROM absent_teachers WHERE absent_date = CURDATE()) as totalAbsent,
          (SELECT COUNT(*) FROM teacher_schedule) as totalSchedules
      `, [currentDay, currentTime, currentTime]);
      
      // Get only currently active periods with proper time comparison
      const [currentPeriods] = await db.execute(`
        SELECT ts.*, t.name as teacher_name, t.department,
               CASE WHEN at.teacher_id IS NOT NULL THEN 1 ELSE 0 END as is_absent,
               ct.name as covered_by_name,
               ts.period_start, ts.period_end
        FROM teacher_schedule ts
        JOIN teachers t ON ts.teacher_id = t.id
        LEFT JOIN absent_teachers at ON ts.teacher_id = at.teacher_id AND at.absent_date = CURDATE()
        LEFT JOIN teachers ct ON ts.covered_by = ct.id
        WHERE ts.day = ? 
        AND TIME(?) >= TIME(ts.period_start) 
        AND TIME(?) < TIME(ts.period_end)
        ORDER BY ts.period_start
      `, [currentDay, currentTime, currentTime]);
      
      console.log('Found current periods:', currentPeriods.length);
      
      // Get upcoming periods (next 2 hours)
      const [upcomingPeriods] = await db.execute(`
        SELECT ts.*, t.name as teacher_name, t.department
        FROM teacher_schedule ts
        JOIN teachers t ON ts.teacher_id = t.id
        WHERE ts.day = ? 
        AND TIME(ts.period_start) > TIME(?)
        AND TIME(ts.period_start) <= ADDTIME(TIME(?), '02:00:00')
        ORDER BY ts.period_start
        LIMIT 5
      `, [currentDay, currentTime, currentTime]);
      
      console.log('Found upcoming periods:', upcomingPeriods.length);
      
      // Get recent activities
      const [recentActivities] = await db.execute(`
        SELECT 'absence' as type, t.name as teacher_name, at.created_at, at.reason
        FROM absent_teachers at
        JOIN teachers t ON at.teacher_id = t.id
        WHERE at.absent_date = CURDATE()
        ORDER BY at.created_at DESC
        LIMIT 5
      `);
      
      res.json({
        stats: results[0],
        currentPeriods,
        upcomingPeriods,
        recentActivities,
        currentTime,
        currentDay
      });
    } else {
      // Teacher dashboard - basic data
      const [teacherSchedule] = await db.execute(`
        SELECT ts.*
        FROM teacher_schedule ts
        WHERE ts.teacher_id = ?
        LIMIT 10
      `, [userId]);
      
      res.json({
        schedule: teacherSchedule,
        notifications: []
      });
    }
  } catch (error) {
    console.error('Dashboard data error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Error fetching dashboard data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Bulk operations for better performance
const bulkUpdateTeachers = async (req, res) => {
  try {
    const { updates } = req.body; // Array of {id, data} objects
    
    const connection = await db.pool.getConnection();
    await connection.beginTransaction();
    
    try {
      for (const update of updates) {
        await connection.execute(
          'UPDATE teachers SET name = ?, email = ?, status = ?, department = ?, subject = ?, phone = ? WHERE id = ?',
          [update.data.name, update.data.email, update.data.status, update.data.department, update.data.subject, update.data.phone, update.id]
        );
      }
      
      await connection.commit();
      clearCache('teachers');
      res.json({ message: 'Teachers updated successfully' });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ message: 'Error updating teachers' });
  }
};

// Optimized search with full-text search
const searchTeachers = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    
    if (!q || q.length < 2) {
      return res.json([]);
    }
    
    const [results] = await db.execute(`
      SELECT id, name, email, department, subject
      FROM teachers 
      WHERE MATCH(name, email) AGAINST(? IN NATURAL LANGUAGE MODE)
         OR name LIKE ? 
         OR email LIKE ?
      LIMIT ?
    `, [q, `%${q}%`, `%${q}%`, parseInt(limit)]);
    
    res.json(results);
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ message: 'Search failed' });
  }
};

module.exports = {
  getDashboardData,
  bulkUpdateTeachers,
  searchTeachers
};