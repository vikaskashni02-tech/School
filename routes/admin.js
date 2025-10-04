const express = require('express');
const multer = require('multer');
const { auth, adminAuth } = require('../middleware/auth');
const { teacherValidation, teacherUpdateValidation, scheduleValidation, absentValidation } = require('../middleware/validation');
const { activityLogger } = require('../middleware/logger');
const { paginate } = require('../middleware/pagination');
const { addTeacher, getTeachers, updateTeacher, deleteTeacher, addSchedule, getSchedules, deleteSchedule, getDashboardStats } = require('../controllers/adminController');
const { markAbsent, getAllSchedules } = require('../controllers/scheduleController');
const { getAbsentTeachers, removeAbsence, getAbsenceHistory, getCoverageAssignments, reassignCoverage } = require('../controllers/absenceController');
const { getLeaveRequests, updateLeaveStatus } = require('../controllers/leaveController');
const { getTeacherWorkload, getAbsenceReport, getCoverageReport, getClassDistribution, getWeeklyStats } = require('../controllers/reportsController');
const { importSchedules, exportSchedules, exportTeachers } = require('../controllers/csvController');
const { bulkAddTeachers, bulkAddSchedules, bulkDeleteSchedules } = require('../controllers/bulkController');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.use(auth);
router.use(adminAuth);

// Teachers
router.post('/teachers', teacherValidation, activityLogger('ADD_TEACHER', 'teacher'), addTeacher);
router.get('/teachers', paginate, getTeachers);
router.put('/teachers/:id', teacherUpdateValidation, activityLogger('UPDATE_TEACHER', 'teacher'), updateTeacher);
router.delete('/teachers/:id', activityLogger('DELETE_TEACHER', 'teacher'), deleteTeacher);

// Schedules
router.post('/schedule', scheduleValidation, activityLogger('ADD_SCHEDULE', 'schedule'), addSchedule);
router.get('/schedules', paginate, getSchedules);
router.get('/schedules/all', paginate, getAllSchedules);
router.delete('/schedules/:id', activityLogger('DELETE_SCHEDULE', 'schedule'), deleteSchedule);

// Absence Management
router.post('/absent', absentValidation, activityLogger('MARK_ABSENT', 'absence'), markAbsent);
router.get('/absent', paginate, getAbsentTeachers);
router.delete('/absent/:id', activityLogger('REMOVE_ABSENCE', 'absence'), removeAbsence);
router.get('/absent/history', getAbsenceHistory);

// Coverage Management
router.get('/coverage', getCoverageAssignments);
router.post('/coverage/reassign', activityLogger('REASSIGN_COVERAGE', 'coverage'), reassignCoverage);

// Leave Requests
router.get('/leave-requests', getLeaveRequests);
router.put('/leave-requests/:id', activityLogger('UPDATE_LEAVE_STATUS', 'leave'), updateLeaveStatus);

// Reports
router.get('/reports/workload', getTeacherWorkload);
router.get('/reports/absence', getAbsenceReport);
router.get('/reports/coverage', getCoverageReport);
router.get('/reports/classes', getClassDistribution);
router.get('/reports/weekly', getWeeklyStats);

// CSV Import/Export
router.post('/import/schedules', upload.single('file'), importSchedules);
router.get('/export/schedules', exportSchedules);
router.get('/export/teachers', exportTeachers);

// Bulk Operations
router.post('/bulk/teachers', bulkAddTeachers);
router.post('/bulk/schedules', bulkAddSchedules);
router.delete('/bulk/schedules', bulkDeleteSchedules);

// Dashboard
router.get('/dashboard', getDashboardStats);

module.exports = router;