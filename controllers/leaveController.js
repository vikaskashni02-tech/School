const db = require('../config/database');
const { createNotification } = require('./notificationController');
const { sendLeaveRequestNotification, sendLeaveStatusUpdate } = require('../services/emailService');

const requestLeave = async (req, res) => {
  try {
    const { startDate, endDate, reason } = req.body;
    const teacherId = req.user.id;

    await db.execute(
      'INSERT INTO leave_requests (teacher_id, start_date, end_date, reason) VALUES (?, ?, ?, ?)',
      [teacherId, startDate, endDate, reason]
    );

    const [admins] = await db.execute('SELECT id, email FROM teachers WHERE role = "admin"');
    for (const admin of admins) {
      await createNotification(admin.id, 'New Leave Request', `${req.user.name} requested leave from ${startDate} to ${endDate}`, 'info');
      await sendLeaveRequestNotification(admin.email, req.user.name, startDate, endDate);
    }

    res.json({ message: 'Leave request submitted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const getLeaveRequests = async (req, res) => {
  try {
    const query = req.user.role === 'admin' 
      ? 'SELECT lr.*, t.name as teacher_name FROM leave_requests lr JOIN teachers t ON lr.teacher_id = t.id ORDER BY lr.created_at DESC'
      : 'SELECT * FROM leave_requests WHERE teacher_id = ? ORDER BY created_at DESC';
    
    const params = req.user.role === 'admin' ? [] : [req.user.id];
    const [rows] = await db.execute(query, params);
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    await db.execute('UPDATE leave_requests SET status = ? WHERE id = ?', [status, id]);

    const [leave] = await db.execute(
      'SELECT lr.*, t.email, t.name FROM leave_requests lr JOIN teachers t ON lr.teacher_id = t.id WHERE lr.id = ?',
      [id]
    );
    if (leave.length > 0) {
      await createNotification(
        leave[0].teacher_id, 
        'Leave Request ' + status.charAt(0).toUpperCase() + status.slice(1),
        `Your leave request has been ${status}`,
        status === 'approved' ? 'success' : 'warning'
      );
      await sendLeaveStatusUpdate(leave[0].email, leave[0].name, status, leave[0].start_date, leave[0].end_date);
    }

    res.json({ message: 'Leave request updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { requestLeave, getLeaveRequests, updateLeaveStatus };
