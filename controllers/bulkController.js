const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { sendWelcomeEmail } = require('../services/emailService');

const bulkAddTeachers = async (req, res) => {
  try {
    const { teachers } = req.body;
    const results = { success: [], failed: [] };

    for (const teacher of teachers) {
      try {
        const hashedPassword = await bcrypt.hash(teacher.password || 'password123', 10);
        const [result] = await db.execute(
          'INSERT INTO teachers (name, email, password, department, subject, phone) VALUES (?, ?, ?, ?, ?, ?)',
          [teacher.name, teacher.email, hashedPassword, teacher.department, teacher.subject, teacher.phone]
        );
        
        await sendWelcomeEmail(teacher.email, teacher.name, teacher.password || 'password123');
        results.success.push({ ...teacher, id: result.insertId });
      } catch (error) {
        results.failed.push({ ...teacher, error: error.message });
      }
    }

    res.json({
      message: `Bulk operation completed. ${results.success.length} added, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const bulkAddSchedules = async (req, res) => {
  try {
    const { schedules } = req.body;
    const results = { success: [], failed: [] };

    for (const schedule of schedules) {
      try {
        await db.execute(
          'INSERT INTO teacher_schedule (teacher_id, day, period_start, period_end, class_name, subject, room) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [schedule.teacherId, schedule.day, schedule.periodStart, schedule.periodEnd, schedule.className, schedule.subject, schedule.room]
        );
        results.success.push(schedule);
      } catch (error) {
        results.failed.push({ ...schedule, error: error.message });
      }
    }

    res.json({
      message: `Bulk operation completed. ${results.success.length} added, ${results.failed.length} failed`,
      results
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const bulkDeleteSchedules = async (req, res) => {
  try {
    const { scheduleIds } = req.body;
    
    await db.execute(
      `DELETE FROM teacher_schedule WHERE id IN (${scheduleIds.map(() => '?').join(',')})`,
      scheduleIds
    );

    res.json({ message: `${scheduleIds.length} schedules deleted successfully` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  bulkAddTeachers,
  bulkAddSchedules,
  bulkDeleteSchedules
};
