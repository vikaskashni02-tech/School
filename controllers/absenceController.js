const db = require('../config/database');
const moment = require('moment');
const { createNotification } = require('./notificationController');

const getAbsentTeachers = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || moment().format('YYYY-MM-DD');

    const [rows] = await db.execute(`
      SELECT at.*, t.name as teacher_name, t.email, t.department
      FROM absent_teachers at
      JOIN teachers t ON at.teacher_id = t.id
      WHERE at.absent_date = ?
      ORDER BY at.created_at DESC
    `, [targetDate]);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const removeAbsence = async (req, res) => {
  try {
    const { id } = req.params;

    const [absence] = await db.execute('SELECT * FROM absent_teachers WHERE id = ?', [id]);
    if (absence.length === 0) {
      return res.status(404).json({ message: 'Absence record not found' });
    }

    await db.execute('DELETE FROM absent_teachers WHERE id = ?', [id]);
    
    // Clear coverage assignments
    const dayName = moment(absence[0].absent_date).format('dddd');
    await db.execute(
      'UPDATE teacher_schedule SET covered_by = NULL, is_covered = FALSE WHERE teacher_id = ? AND day = ?',
      [absence[0].teacher_id, dayName]
    );

    await createNotification(absence[0].teacher_id, 'Absence Removed', 'Your absence marking has been removed', 'info');
    res.json({ message: 'Absence removed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getAbsenceHistory = async (req, res) => {
  try {
    const { teacherId, startDate, endDate } = req.query;
    
    let query = `
      SELECT at.*, t.name as teacher_name
      FROM absent_teachers at
      JOIN teachers t ON at.teacher_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (teacherId) {
      query += ' AND at.teacher_id = ?';
      params.push(teacherId);
    }
    if (startDate) {
      query += ' AND at.absent_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND at.absent_date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY at.absent_date DESC';

    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getCoverageAssignments = async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || moment().format('YYYY-MM-DD');
    const dayName = moment(targetDate).format('dddd');

    const [rows] = await db.execute(`
      SELECT ts.*, 
             t1.name as original_teacher,
             t2.name as covering_teacher,
             at.reason as absence_reason
      FROM teacher_schedule ts
      JOIN teachers t1 ON ts.teacher_id = t1.id
      LEFT JOIN teachers t2 ON ts.covered_by = t2.id
      LEFT JOIN absent_teachers at ON ts.teacher_id = at.teacher_id AND at.absent_date = ?
      WHERE ts.day = ? AND ts.is_covered = TRUE
      ORDER BY ts.period_start
    `, [targetDate, dayName]);

    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const reassignCoverage = async (req, res) => {
  try {
    const { scheduleId, newTeacherId } = req.body;

    const [schedule] = await db.execute('SELECT * FROM teacher_schedule WHERE id = ?', [scheduleId]);
    if (schedule.length === 0) {
      return res.status(404).json({ message: 'Schedule not found' });
    }

    // Check if new teacher is available
    const [conflicts] = await db.execute(`
      SELECT * FROM teacher_schedule 
      WHERE teacher_id = ? AND day = ? 
      AND period_start < ? AND period_end > ?
    `, [newTeacherId, schedule[0].day, schedule[0].period_end, schedule[0].period_start]);

    if (conflicts.length > 0) {
      return res.status(400).json({ message: 'Teacher is not available at this time' });
    }

    await db.execute(
      'UPDATE teacher_schedule SET covered_by = ?, is_covered = TRUE WHERE id = ?',
      [newTeacherId, scheduleId]
    );

    await createNotification(
      newTeacherId, 
      'Coverage Assignment', 
      `You have been assigned to cover ${schedule[0].class_name}`, 
      'warning'
    );

    res.json({ message: 'Coverage reassigned successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { 
  getAbsentTeachers, 
  removeAbsence, 
  getAbsenceHistory, 
  getCoverageAssignments,
  reassignCoverage
};
