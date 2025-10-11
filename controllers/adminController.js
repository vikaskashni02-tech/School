const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { createNotification } = require('./notificationController');
const { sendWelcomeEmail } = require('../services/emailService');
const { clearCache } = require('../middleware/cache');

const addTeacher = async (req, res) => {
  try {
    const { name, email, password, department, subject, phone } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await db.execute(
      'INSERT INTO teachers (name, email, password, department, subject, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, department || null, subject || null, phone || null]
    );

    await createNotification(result.insertId, 'Welcome!', 'Your account has been created successfully', 'success');
    await sendWelcomeEmail(email, name, password);
    clearCache('teachers');
    res.json({ message: 'Teacher added successfully', id: result.insertId });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const getTeachers = async (req, res) => {
  try {
    console.log('Fetching teachers with query params:', req.query);
    
    // First, test if teachers table exists
    await db.execute('DESCRIBE teachers');
    console.log('Teachers table exists');
    
    const { page = 1, limit = 50, search, status, role } = req.query;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT id, name, email, role, status, department, subject, phone FROM teachers';
    let countQuery = 'SELECT COUNT(*) as total FROM teachers';
    const params = [];
    const conditions = [];
    
    if (search) {
      conditions.push('(name LIKE ? OR email LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }
    
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }
    
    if (role) {
      conditions.push('role = ?');
      params.push(role);
    }
    
    if (conditions.length > 0) {
      const whereClause = ' WHERE ' + conditions.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }
    
    query += ' ORDER BY name LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    // Execute queries separately for better error handling
    const [countResult] = await db.execute(countQuery, params.slice(0, -2));
    const [rows] = await db.execute(query, params);
    
    console.log('Count result:', countResult);
    console.log('Rows result:', rows);
    
    const total = countResult[0]?.total || 0;
    
    res.json({
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching teachers:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    res.status(500).json({ 
      message: 'Error fetching teachers', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

const addSchedule = async (req, res) => {
  try {
    const { teacherId, day, periodStart, periodEnd, className, subject, room } = req.body;

    // Check for conflicts
    const [conflicts] = await db.execute(
      'SELECT * FROM teacher_schedule WHERE teacher_id = ? AND day = ? AND ((period_start < ? AND period_end > ?) OR (period_start < ? AND period_end > ?))',
      [teacherId, day, periodEnd, periodStart, periodEnd, periodStart]
    );

    if (conflicts.length > 0) {
      return res.status(400).json({ message: 'Schedule conflict detected', conflicts });
    }

    await db.execute(
      'INSERT INTO teacher_schedule (teacher_id, day, period_start, period_end, class_name, subject, room) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [teacherId, day, periodStart, periodEnd, className, subject, room]
    );

    await createNotification(teacherId, 'New Schedule', `You have been assigned to ${className} on ${day}`, 'info');
    clearCache('schedules');
    res.json({ message: 'Schedule added successfully' });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Duplicate schedule entry' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const updateTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, status, department, subject, phone } = req.body;
    
    console.log('Update request for teacher ID:', id);
    console.log('Request body:', req.body);
    
    // Convert empty strings to null
    const deptValue = department && department.trim() !== '' ? department.trim() : null;
    const subjValue = subject && subject.trim() !== '' ? subject.trim() : null;
    const phoneValue = phone && phone.trim() !== '' ? phone.trim() : null;
    
    console.log('Processed values:', { deptValue, subjValue, phoneValue });
    
    const [result] = await db.execute(
      'UPDATE teachers SET name = ?, email = ?, status = ?, department = ?, subject = ?, phone = ? WHERE id = ?',
      [name, email, status || 'active', deptValue, subjValue, phoneValue, id]
    );
    
    console.log('Update result:', result);
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Teacher not found' });
    }
    
    clearCache('teachers');
    res.json({ message: 'Teacher updated successfully' });
  } catch (error) {
    console.error('Update error:', error);
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Email already exists' });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const deleteTeacher = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM teachers WHERE id = ?', [id]);
    clearCache('teachers');
    res.json({ message: 'Teacher deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getSchedules = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT ts.*, t.name as teacher_name 
      FROM teacher_schedule ts
      JOIN teachers t ON ts.teacher_id = t.id
      ORDER BY ts.day, ts.period_start
    `);
    res.json(rows);
  } catch (error) {
    // Fallback response when DB is unavailable
    res.json([]);
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM teacher_schedule WHERE id = ?', [id]);
    clearCache('schedules');
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    // Single optimized query to get all stats at once
    const [results] = await db.execute(`
      SELECT 
        (SELECT COUNT(*) FROM teachers WHERE status = 'active' AND role = 'teacher') as activeTeachers,
        (SELECT COUNT(*) FROM teacher_schedule ts WHERE ts.day = DAYNAME(NOW()) AND ts.period_start <= TIME(NOW()) AND ts.period_end > TIME(NOW())) as currentClasses,
        (SELECT COUNT(*) FROM teacher_schedule ts LEFT JOIN absent_teachers at ON ts.teacher_id = at.teacher_id AND at.absent_date = CURDATE() WHERE ts.day = DAYNAME(NOW()) AND at.teacher_id IS NOT NULL AND ts.covered_by IS NULL) as emptyPeriods,
        (SELECT COUNT(*) FROM absent_teachers WHERE absent_date = CURDATE()) as totalAbsent,
        (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending') as pendingLeaves,
        (SELECT COUNT(*) FROM teacher_schedule) as totalSchedules
    `);

    res.json(results[0]);
  } catch (error) {
    // Fallback when DB is unavailable
    res.json({
      activeTeachers: 1,
      currentClasses: 0,
      emptyPeriods: 0,
      totalAbsent: 0,
      pendingLeaves: 0,
      totalSchedules: 0,
      fallback: true
    });
  }
};

module.exports = { addTeacher, getTeachers, updateTeacher, deleteTeacher, addSchedule, getSchedules, deleteSchedule, getDashboardStats };