const db = require('../config/database');
const moment = require('moment');
const { sendAbsenceNotification, sendCoverageAssignment } = require('../services/emailService');
const { autoAssignSmartCoverage } = require('../services/smartScheduler');

const getCurrentPeriod = async (req, res) => {
  try {
    const now = moment();
    const currentDay = now.format('dddd');
    const currentTime = now.format('HH:mm:ss');

    const [rows] = await db.execute(`
      SELECT ts.*, t.name as teacher_name, t.status,
             CASE WHEN at.teacher_id IS NOT NULL THEN 1 ELSE 0 END as is_absent,
             ct.name as covered_by_name
      FROM teacher_schedule ts
      JOIN teachers t ON ts.teacher_id = t.id
      LEFT JOIN absent_teachers at ON t.id = at.teacher_id AND at.absent_date = CURDATE()
      LEFT JOIN teachers ct ON ts.covered_by = ct.id
      WHERE ts.day = ? AND ts.period_start <= ? AND ts.period_end > ?
    `, [currentDay, currentTime, currentTime]);

    res.json(rows);
  } catch (error) {
    // Fallback when DB is unavailable
    res.json([]);
  }
};

const getTeacherSchedule = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const { day, week } = req.query;
    const targetDay = day || moment().format('dddd');

    let query = `
      SELECT ts.*, 
             CASE WHEN at.teacher_id IS NOT NULL THEN 1 ELSE 0 END as is_absent,
             CASE WHEN ts.covered_by = ? THEN 1 ELSE 0 END as is_covering
      FROM teacher_schedule ts
      LEFT JOIN absent_teachers at ON ts.teacher_id = at.teacher_id AND at.absent_date = CURDATE()
      WHERE (ts.teacher_id = ? OR ts.covered_by = ?)
    `;
    const params = [teacherId, teacherId, teacherId];

    if (!week) {
      query += ' AND ts.day = ?';
      params.push(targetDay);
    }

    query += ' ORDER BY FIELD(ts.day, "Monday","Tuesday","Wednesday","Thursday","Friday"), ts.period_start';

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (error) {
    // Fallback when DB is unavailable
    res.json({ fallback: true, data: [] });
  }
};

const markAbsent = async (req, res) => {
  try {
    const { teacherId, reason, date } = req.body;
    const targetDate = date || moment().format('YYYY-MM-DD');

    console.log('Marking teacher absent:', { teacherId, reason, targetDate });

    // Validate teacherId
    if (!teacherId || isNaN(teacherId)) {
      return res.status(400).json({ message: 'Valid teacher ID is required' });
    }

    // Check if teacher exists
    const [teacherExists] = await db.execute(
      'SELECT id, name, email FROM teachers WHERE id = ? AND status = "active"',
      [teacherId]
    );

    if (teacherExists.length === 0) {
      return res.status(404).json({ message: 'Teacher not found or inactive' });
    }

    // Check if already marked absent
    const [existing] = await db.execute(
      'SELECT * FROM absent_teachers WHERE teacher_id = ? AND absent_date = ?',
      [teacherId, targetDate]
    );

    if (existing.length > 0) {
      return res.status(400).json({ message: 'Teacher already marked absent for this date' });
    }

    // Insert absence record
    await db.execute(
      'INSERT INTO absent_teachers (teacher_id, absent_date, reason) VALUES (?, ?, ?)',
      [teacherId, targetDate, reason || 'No reason provided']
    );

    console.log('Absence record created successfully');

    // Auto-assign free teachers using smart algorithm
    let assigned = 0;
    try {
      assigned = await autoAssignSmartCoverage(teacherId, targetDate);
      console.log('Coverage assigned:', assigned);
    } catch (coverageError) {
      console.error('Coverage assignment failed:', coverageError.message);
      // Continue even if coverage assignment fails
    }

    // Create notification
    try {
      const { createNotification } = require('./notificationController');
      await createNotification(teacherId, 'Marked Absent', `You have been marked absent for ${targetDate}`, 'warning');
    } catch (notificationError) {
      console.error('Notification creation failed:', notificationError.message);
      // Continue even if notification fails
    }

    // Send email notification
    try {
      const teacher = teacherExists[0];
      await sendAbsenceNotification(teacher.email, teacher.name, targetDate, reason);
    } catch (emailError) {
      console.error('Email notification failed:', emailError.message);
      // Continue even if email fails
    }

    // Emit socket events (non-blocking)
    setImmediate(() => {
      try {
        const io = req.app.get('io');
        if (io) {
          io.emit('absence-marked', { teacherId, date: targetDate });
          io.emit('dashboard-update');
        }
      } catch (socketError) {
        console.error('Socket emission failed:', socketError.message);
      }
    });

    res.json({ 
      message: 'Teacher marked absent successfully',
      coverageAssigned: assigned,
      teacherName: teacherExists[0].name,
      date: targetDate
    });
  } catch (error) {
    console.error('Error in markAbsent:', error);
    
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ message: 'Teacher already marked absent for this date' });
    }
    
    if (error.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ message: 'Invalid teacher ID provided' });
    }
    
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return res.status(503).json({ message: 'Database connection failed. Please try again.' });
    }
    
    res.status(500).json({ 
      message: 'Failed to mark teacher absent', 
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

const autoAssignCoverage = async (absentTeacherId, date) => {
  const dayName = moment(date).format('dddd');
  const { createNotification } = require('./notificationController');
  let assignedCount = 0;
  
  // Get absent teacher's periods
  const [absentPeriods] = await db.execute(`
    SELECT * FROM teacher_schedule 
    WHERE teacher_id = ? AND day = ?
  `, [absentTeacherId, dayName]);

  for (const period of absentPeriods) {
    // Find free teachers for this period, prefer same subject
    const [freeTeachers] = await db.execute(`
      SELECT t.id, t.name, t.subject,
             CASE WHEN t.subject = ? THEN 1 ELSE 0 END as subject_match,
             (SELECT COUNT(*) FROM teacher_schedule WHERE covered_by = t.id) as coverage_count
      FROM teachers t
      WHERE t.id != ? AND t.status = 'active' AND t.role = 'teacher'
      AND t.id NOT IN (
        SELECT ts.teacher_id FROM teacher_schedule ts
        WHERE ts.day = ? AND ts.period_start < ? AND ts.period_end > ?
      )
      AND t.id NOT IN (
        SELECT at.teacher_id FROM absent_teachers at
        WHERE at.absent_date = ?
      )
      ORDER BY subject_match DESC, coverage_count ASC
      LIMIT 1
    `, [period.subject, absentTeacherId, dayName, period.period_end, period.period_start, date]);

    if (freeTeachers.length > 0) {
      await db.execute(
        'UPDATE teacher_schedule SET covered_by = ?, is_covered = 1 WHERE id = ?',
        [freeTeachers[0].id, period.id]
      );
      
      await createNotification(
        freeTeachers[0].id,
        'Coverage Assignment',
        `You have been assigned to cover ${period.class_name} (${period.period_start}-${period.period_end})`,
        'warning'
      );
      
      const [coverTeacher] = await db.execute('SELECT email, name FROM teachers WHERE id = ?', [freeTeachers[0].id]);
      if (coverTeacher.length > 0) {
        await sendCoverageAssignment(
          coverTeacher[0].email,
          coverTeacher[0].name,
          period.class_name,
          `${period.period_start}-${period.period_end}`,
          date
        );
      }
      assignedCount++;
      
      const io = require('../config/database').io;
      if (io) {
        io.emit('coverage-assigned', { teacherId: freeTeachers[0].id, scheduleId: period.id });
      }
    }
  }
  
  return assignedCount;
};

const getWeeklySchedule = async (req, res) => {
  try {
    const { teacherId } = req.query;
    const targetTeacherId = teacherId || req.user.id;

    const [rows] = await db.execute(`
      SELECT ts.*, t.name as teacher_name
      FROM teacher_schedule ts
      JOIN teachers t ON ts.teacher_id = t.id
      WHERE ts.teacher_id = ?
      ORDER BY FIELD(ts.day, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'), ts.period_start
    `, [targetTeacherId]);

    res.json(rows);
  } catch (error) {
    // Fallback when DB is unavailable
    res.json({ fallback: true, data: [] });
  }
};

const getAllSchedules = async (req, res) => {
  try {
    const { day, teacherId, className } = req.query;
    
    let query = `
      SELECT ts.*, t.name as teacher_name, t.department, t.subject as teacher_subject,
             ct.name as covered_by_name
      FROM teacher_schedule ts
      JOIN teachers t ON ts.teacher_id = t.id
      LEFT JOIN teachers ct ON ts.covered_by = ct.id
      WHERE 1=1
    `;
    const params = [];

    if (day) {
      query += ' AND ts.day = ?';
      params.push(day);
    }
    if (teacherId) {
      query += ' AND ts.teacher_id = ?';
      params.push(teacherId);
    }
    if (className) {
      query += ' AND ts.class_name LIKE ?';
      params.push(`%${className}%`);
    }

    query += ' ORDER BY FIELD(ts.day, "Monday","Tuesday","Wednesday","Thursday","Friday"), ts.period_start';

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (error) {
    // Fallback when DB is unavailable
    res.json([]);
  }
};

module.exports = { getCurrentPeriod, getTeacherSchedule, markAbsent, getWeeklySchedule, getAllSchedules };