const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { createNotification } = require('./notificationController');
const { sendWelcomeEmail } = require('../services/emailService');

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
    const [rows] = await db.execute('SELECT id, name, email, role, status, department, subject, phone FROM teachers');
    res.json(rows);
  } catch (error) {
    // Fallback response when DB is unavailable
    const fallbackTeachers = [
      { id: 1, name: 'Admin User', email: 'admin@school.com', role: 'admin', status: 'active', department: 'Administration', subject: null, phone: null },
      { id: 2, name: 'John Doe', email: 'john@school.com', role: 'teacher', status: 'active', department: 'Mathematics', subject: 'Algebra', phone: null }
    ];
    res.json({ fallback: true, data: fallbackTeachers });
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
    res.json({ fallback: true, data: [] });
  }
};

const deleteSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM teacher_schedule WHERE id = ?', [id]);
    res.json({ message: 'Schedule deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    const [activeTeachers] = await db.execute('SELECT COUNT(*) as count FROM teachers WHERE status = "active" AND role = "teacher"');
    const [currentClasses] = await db.execute(`
      SELECT COUNT(*) as count FROM teacher_schedule ts
      WHERE ts.day = DAYNAME(NOW()) 
      AND ts.period_start <= TIME(NOW()) 
      AND ts.period_end > TIME(NOW())
    `);
    const [emptyPeriods] = await db.execute(`
      SELECT COUNT(*) as count FROM teacher_schedule ts
      LEFT JOIN absent_teachers at ON ts.teacher_id = at.teacher_id AND at.absent_date = CURDATE()
      WHERE ts.day = DAYNAME(NOW()) 
      AND at.teacher_id IS NOT NULL 
      AND ts.covered_by IS NULL
    `);
    const [totalAbsent] = await db.execute('SELECT COUNT(*) as count FROM absent_teachers WHERE absent_date = CURDATE()');
    const [pendingLeaves] = await db.execute('SELECT COUNT(*) as count FROM leave_requests WHERE status = "pending"');
    const [totalSchedules] = await db.execute('SELECT COUNT(*) as count FROM teacher_schedule');

    res.json({
      activeTeachers: activeTeachers[0].count,
      currentClasses: currentClasses[0].count,
      emptyPeriods: emptyPeriods[0].count,
      totalAbsent: totalAbsent[0].count,
      pendingLeaves: pendingLeaves[0].count,
      totalSchedules: totalSchedules[0].count
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { addTeacher, getTeachers, updateTeacher, deleteTeacher, addSchedule, getSchedules, deleteSchedule, getDashboardStats };