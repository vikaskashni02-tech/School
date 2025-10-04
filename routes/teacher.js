const express = require('express');
const { auth } = require('../middleware/auth');
const { getTeacherSchedule, getCurrentPeriod, getWeeklySchedule } = require('../controllers/scheduleController');
const { requestLeave, getLeaveRequests } = require('../controllers/leaveController');
const { getNotifications, markAsRead, markAllAsRead, getUnreadCount } = require('../controllers/notificationController');
const { leaveRequestValidation } = require('../middleware/validation');

const router = express.Router();

router.use(auth);

// Schedule
router.get('/schedule', getTeacherSchedule);
router.get('/schedule/weekly', getWeeklySchedule);
router.get('/current-period', getCurrentPeriod);

// Leave Requests
router.post('/leave-request', leaveRequestValidation, requestLeave);
router.get('/leave-requests', getLeaveRequests);

// Notifications
router.get('/notifications', getNotifications);
router.put('/notifications/:id/read', markAsRead);
router.put('/notifications/read-all', markAllAsRead);
router.get('/notifications/unread-count', getUnreadCount);

module.exports = router;