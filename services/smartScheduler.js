const db = require('../config/database');

const calculateTeacherScore = async (teacherId, period, date) => {
  try {
    let score = 100;

    // Calculate workload penalty
    try {
      const [workload] = await db.execute(
        'SELECT COUNT(*) as count FROM teacher_schedule WHERE covered_by = ?',
        [teacherId]
      );
      score -= (workload[0]?.count || 0) * 5;
    } catch (workloadError) {
      console.error('Error calculating workload:', workloadError.message);
    }

    // Subject match bonus
    try {
      const [teacher] = await db.execute('SELECT subject FROM teachers WHERE id = ?', [teacherId]);
      if (teacher[0]?.subject === period.subject) {
        score += 30;
      }
    } catch (subjectError) {
      console.error('Error checking subject match:', subjectError.message);
    }

    // Recent absences bonus (teachers who were recently absent get priority)
    try {
      const [recentAbsences] = await db.execute(
        'SELECT COUNT(*) as count FROM absent_teachers WHERE teacher_id = ? AND absent_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)',
        [teacherId]
      );
      score += (recentAbsences[0]?.count || 0) * 10;
    } catch (absenceError) {
      console.error('Error calculating recent absences:', absenceError.message);
    }

    // Consecutive classes penalty
    try {
      const [consecutiveClasses] = await db.execute(
        `SELECT COUNT(*) as count FROM teacher_schedule 
         WHERE teacher_id = ? AND day = ? 
         AND (period_end = ? OR period_start = ?)`,
        [teacherId, period.day, period.period_start, period.period_end]
      );
      if ((consecutiveClasses[0]?.count || 0) > 0) {
        score -= 15;
      }
    } catch (consecutiveError) {
      console.error('Error checking consecutive classes:', consecutiveError.message);
    }

    return Math.max(0, score);
  } catch (error) {
    console.error('Error in calculateTeacherScore:', error.message);
    return 50; // Return default score if calculation fails
  }
};

const findBestCoverageTeacher = async (absentTeacherId, period, date) => {
  try {
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

    if (freeTeachers.length === 0) {
      console.log(`No free teachers found for period ${period.id}`);
      return null;
    }

    const teachersWithScores = await Promise.all(
      freeTeachers.map(async (teacher) => {
        try {
          const score = await calculateTeacherScore(teacher.id, period, date);
          return { ...teacher, score };
        } catch (scoreError) {
          console.error(`Error calculating score for teacher ${teacher.id}:`, scoreError.message);
          return { ...teacher, score: 50 }; // Default score if calculation fails
        }
      })
    );

    teachersWithScores.sort((a, b) => b.score - a.score);
    return teachersWithScores[0];
  } catch (error) {
    console.error('Error in findBestCoverageTeacher:', error.message);
    return null;
  }
};

const autoAssignSmartCoverage = async (absentTeacherId, date) => {
  try {
    const dayName = require('moment')(date).format('dddd');
    const { createNotification } = require('../controllers/notificationController');
    const { sendCoverageAssignment } = require('./emailService');
    let assignedCount = 0;

    const [absentPeriods] = await db.execute(
      'SELECT * FROM teacher_schedule WHERE teacher_id = ? AND day = ?',
      [absentTeacherId, dayName]
    );

    console.log(`Found ${absentPeriods.length} periods for absent teacher ${absentTeacherId}`);

    for (const period of absentPeriods) {
      try {
        const bestTeacher = await findBestCoverageTeacher(absentTeacherId, period, date);

        if (bestTeacher) {
          await db.execute(
            'UPDATE teacher_schedule SET covered_by = ?, is_covered = 1 WHERE id = ?',
            [bestTeacher.id, period.id]
          );

          // Try to create notification, but don't fail if it doesn't work
          try {
            await createNotification(
              bestTeacher.id,
              'Coverage Assignment',
              `You have been assigned to cover ${period.class_name} (${period.period_start}-${period.period_end})`,
              'warning'
            );
          } catch (notifError) {
            console.error('Failed to create coverage notification:', notifError.message);
          }

          // Try to send email, but don't fail if it doesn't work
          try {
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
          } catch (emailError) {
            console.error('Failed to send coverage email:', emailError.message);
          }

          assignedCount++;
          console.log(`Assigned coverage for period ${period.id} to teacher ${bestTeacher.id}`);
        } else {
          console.log(`No available teacher found for period ${period.id}`);
        }
      } catch (periodError) {
        console.error(`Error processing period ${period.id}:`, periodError.message);
        // Continue with next period
      }
    }

    console.log(`Total coverage assignments: ${assignedCount}`);
    return assignedCount;
  } catch (error) {
    console.error('Error in autoAssignSmartCoverage:', error.message);
    return 0; // Return 0 assignments if the whole process fails
  }
};

module.exports = {
  calculateTeacherScore,
  findBestCoverageTeacher,
  autoAssignSmartCoverage
};
