const db = require('../config/database');
const csv = require('csv-parser');
const { createObjectCsvStringifier } = require('csv-writer');
const fs = require('fs');

const importSchedules = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const results = [];
    const errors = [];

    fs.createReadStream(req.file.path)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        let imported = 0;
        
        for (const row of results) {
          try {
            const { teacherId, day, periodStart, periodEnd, className, subject, room } = row;
            
            // Validate required fields
            if (!teacherId || !day || !periodStart || !periodEnd || !className) {
              errors.push({ row, error: 'Missing required fields' });
              continue;
            }

            await db.execute(
              'INSERT INTO teacher_schedule (teacher_id, day, period_start, period_end, class_name, subject, room) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [teacherId, day, periodStart, periodEnd, className, subject, room]
            );
            imported++;
          } catch (error) {
            errors.push({ row, error: error.message });
          }
        }

        // Clean up uploaded file
        fs.unlinkSync(req.file.path);

        res.json({ 
          message: `Import completed. ${imported} schedules imported.`,
          imported,
          errors: errors.length,
          errorDetails: errors
        });
      });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

const exportSchedules = async (req, res) => {
  try {
    const [schedules] = await db.execute(`
      SELECT ts.*, t.name as teacher_name, t.email as teacher_email
      FROM teacher_schedule ts
      JOIN teachers t ON ts.teacher_id = t.id
      ORDER BY ts.day, ts.period_start
    `);

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'teacher_id', title: 'Teacher ID' },
        { id: 'teacher_name', title: 'Teacher Name' },
        { id: 'teacher_email', title: 'Teacher Email' },
        { id: 'day', title: 'Day' },
        { id: 'period_start', title: 'Start Time' },
        { id: 'period_end', title: 'End Time' },
        { id: 'class_name', title: 'Class' },
        { id: 'subject', title: 'Subject' },
        { id: 'room', title: 'Room' }
      ]
    });

    const csvData = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(schedules);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=schedules.csv');
    res.send(csvData);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const exportTeachers = async (req, res) => {
  try {
    const [teachers] = await db.execute('SELECT id, name, email, department, subject, phone, status FROM teachers WHERE role = "teacher"');

    const csvStringifier = createObjectCsvStringifier({
      header: [
        { id: 'id', title: 'ID' },
        { id: 'name', title: 'Name' },
        { id: 'email', title: 'Email' },
        { id: 'department', title: 'Department' },
        { id: 'subject', title: 'Subject' },
        { id: 'phone', title: 'Phone' },
        { id: 'status', title: 'Status' }
      ]
    });

    const csvData = csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(teachers);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=teachers.csv');
    res.send(csvData);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { importSchedules, exportSchedules, exportTeachers };
