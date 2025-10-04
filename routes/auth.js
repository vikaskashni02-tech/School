const express = require('express');
const { login, requestPasswordReset, resetPassword, changePassword, updateProfile } = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/login', loginLimiter, login);
router.post('/request-reset', requestPasswordReset);
router.post('/reset-password', resetPassword);
router.post('/change-password', auth, changePassword);
router.put('/profile', auth, updateProfile);

module.exports = router;