const db = require('../config/database');

const getTeacherWorkload = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t.id, t.name, t.department, COUNT(ts.id) as total_classes,
             SUM(TIMESTAMPDIFF(MINUTE, ts.period_start, ts.period_end)) as total_minutes
      FROM teachers t
      LEFT JOIN teacher_schedule ts ON t.id = ts.teacher_id
      WHERE t.role = 'teacher'
      GROUP BY t.id
      ORDER BY total_classes DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getAbsenceReport = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t.id, t.name, COUNT(at.id) as absence_count,
             MAX(at.absent_date) as last_absent_date
      FROM teachers t
      LEFT JOIN absent_teachers at ON t.id = at.teacher_id
      WHERE t.role = 'teacher'
      GROUP BY t.id
      ORDER BY absence_count DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getCoverageReport = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT t.id, t.name, COUNT(ts.id) as coverage_count
      FROM teachers t
      LEFT JOIN teacher_schedule ts ON t.id = ts.covered_by
      WHERE t.role = 'teacher' AND ts.is_covered = TRUE
      GROUP BY t.id
      ORDER BY coverage_count DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getClassDistribution = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT class_name, COUNT(*) as class_count, 
             GROUP_CONCAT(DISTINCT day ORDER BY FIELD(day, 'Monday','Tuesday','Wednesday','Thursday','Friday')) as days
      FROM teacher_schedule
      GROUP BY class_name
      ORDER BY class_count DESC
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getWeeklyStats = async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT day, COUNT(*) as total_classes,
             COUNT(DISTINCT teacher_id) as teachers_count,
             SUM(CASE WHEN is_covered = TRUE THEN 1 ELSE 0 END) as covered_classes
      FROM teacher_schedule
      GROUP BY day
      ORDER BY FIELD(day, 'Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday')
    `);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { 
  getTeacherWorkload, 
  getAbsenceReport, 
  getCoverageReport, 
  getClassDistribution,
  getWeeklyStats
};
