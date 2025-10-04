const db = require('../config/database');

const calculateTeacherScore = async (teacherId, period, date) => {
  let score = 100;

  const [workload] = await db.execute(
    'SELECT COUNT(*) as count FROM teacher_schedule WHERE covered_by = ?',
    [teacherId]
  );
  score -= workload[0].count * 5;

  const [teacher] = await db.execute('SELECT subject FROM teachers WHERE id = ?', [teacherId]);
  if (teacher[0].subject === period.subject) {
    score += 30;
  }

  const [recentAbsences] = await db.execute(
    'SELECT COUNT(*) as count FROM absent_teachers WHERE teacher_id = ? AND absent_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)',
    [teacherId]
  );
  score += recentAbsences[0].count * 10;

  const [consecutiveClasses] = await db.execute(
    `SELECT COUNT(*) as count FROM teacher_schedule 
     WHERE teacher_id = ? AND day = ? 
     AND (period_end = ? OR period_start = ?)`,
    [teacherId, period.day, period.period_start, period.period_end]
  );
  if (consecutiveClasses[0].count > 0) {
    score -= 15;
  }

  return Math.max(0, score);
};

const findBestCoverageTeacher = async (absentTeacherId, period, date) => {
  const dayName = require('moment')(date).format('dddd');

  const [freeTeachers] = await db.execute(`
    SELECT t.id, t.name, t.subject
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
  `, [absentTeacherId, dayName, period.period_end, period.period_start, date]);

  if (freeTeachers.length === 0) return null;

  const teachersWithScores = await Promise.all(
    freeTeachers.map(async (teacher) => ({
      ...teacher,
      score: await calculateTeacherScore(teacher.id, period, date)
    }))
  );

  teachersWithScores.sort((a, b) => b.score - a.score);
  return teachersWithScores[0];
};

const autoAssignSmartCoverage = async (absentTeacherId, date) => {
  const dayName = require('moment')(date).format('dddd');
  const { createNotification } = require('../controllers/notificationController');
  const { sendCoverageAssignment } = require('./emailService');
  let assignedCount = 0;

  const [absentPeriods] = await db.execute(
    'SELECT * FROM teacher_schedule WHERE teacher_id = ? AND day = ?',
    [absentTeacherId, dayName]
  );

  for (const period of absentPeriods) {
    const bestTeacher = await findBestCoverageTeacher(absentTeacherId, period, date);

    if (bestTeacher) {
      await db.execute(
        'UPDATE teacher_schedule SET covered_by = ?, is_covered = 1 WHERE id = ?',
        [bestTeacher.id, period.id]
      );

      await createNotification(
        bestTeacher.id,
        'Coverage Assignment',
        `You have been assigned to cover ${period.class_name} (${period.period_start}-${period.period_end})`,
        'warning'
      );

      const [coverTeacher] = await db.execute('SELECT email, name FROM teachers WHERE id = ?', [bestTeacher.id]);
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
    }
  }

  return assignedCount;
};

module.exports = {
  calculateTeacherScore,
  findBestCoverageTeacher,
  autoAssignSmartCoverage
};
