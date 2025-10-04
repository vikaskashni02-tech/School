const { body, param, query, validationResult } = require('express-validator');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      message: 'Validation failed', 
      errors: errors.array().map(e => ({ field: e.param, message: e.msg }))
    });
  }
  next();
};

const teacherValidation = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').optional().isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must be 8+ chars with uppercase, lowercase, and number'),
  body('department').optional({ nullable: true }).trim(),
  body('subject').optional({ nullable: true }).trim(),
  body('phone').optional({ nullable: true }).trim(),
  validate
];

const scheduleValidation = [
  body('teacherId').isInt({ min: 1 }).withMessage('Valid teacher ID is required'),
  body('day').isIn(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']).withMessage('Valid day is required'),
  body('periodStart').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid start time is required'),
  body('periodEnd').matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).withMessage('Valid end time is required')
    .custom((value, { req }) => {
      if (value <= req.body.periodStart) {
        throw new Error('End time must be after start time');
      }
      return true;
    }),
  body('className').trim().notEmpty().isLength({ max: 100 }).escape().withMessage('Class name is required (max 100 chars)'),
  body('subject').optional().trim().escape(),
  body('room').optional().trim().escape(),
  validate
];

const absentValidation = [
  body('teacherId').isInt({ min: 1 }).withMessage('Valid teacher ID is required'),
  body('reason').optional().trim().isLength({ max: 255 }).escape(),
  body('date').optional().isDate().withMessage('Valid date is required'),
  validate
];

const teacherUpdateValidation = [
  body('name').trim().notEmpty().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('status').optional().isIn(['active', 'inactive']).withMessage('Status must be active or inactive'),
  body('department').optional({ nullable: true }).trim(),
  body('subject').optional({ nullable: true }).trim(),
  body('phone').optional({ nullable: true }).trim(),
  validate
];

const leaveRequestValidation = [
  body('startDate').isDate().withMessage('Valid start date is required'),
  body('endDate').isDate().withMessage('Valid end date is required')
    .custom((value, { req }) => {
      if (new Date(value) < new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  body('reason').trim().notEmpty().isLength({ min: 5, max: 500 }).escape().withMessage('Reason is required (5-500 chars)'),
  validate
];

module.exports = { 
  validate, 
  teacherValidation,
  teacherUpdateValidation, 
  scheduleValidation, 
  absentValidation,
  leaveRequestValidation
};
