const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { logActivity } = require('../middleware/logger');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const [rows] = await db.execute('SELECT * FROM teachers WHERE email = ?', [email]);
    
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const teacher = rows[0];
    const isMatch = await bcrypt.compare(password, teacher.password);
    
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (teacher.status === 'inactive') {
      return res.status(403).json({ message: 'Account is inactive' });
    }

    const token = jwt.sign(
      { id: teacher.id, email: teacher.email, role: teacher.role, name: teacher.name },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    await logActivity(teacher.id, 'LOGIN', 'auth', teacher.id, null, req.ip);

    res.json({
      token,
      user: {
        id: teacher.id,
        name: teacher.name,
        email: teacher.email,
        role: teacher.role,
        department: teacher.department,
        subject: teacher.subject
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;
    const [users] = await db.execute('SELECT * FROM teachers WHERE email = ?', [email]);
    
    if (users.length === 0) {
      return res.json({ message: 'If email exists, reset link will be sent' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    await db.execute(
      'UPDATE teachers SET reset_token = ?, reset_token_expiry = ? WHERE email = ?',
      [resetToken, resetTokenExpiry, email]
    );

    // In production, send email with reset link
    console.log(`Password reset token for ${email}: ${resetToken}`);

    res.json({ message: 'If email exists, reset link will be sent', token: resetToken });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    
    const [users] = await db.execute(
      'SELECT * FROM teachers WHERE reset_token = ? AND reset_token_expiry > NOW()',
      [token]
    );

    if (users.length === 0) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.execute(
      'UPDATE teachers SET password = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?',
      [hashedPassword, users[0].id]
    );

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    const [users] = await db.execute('SELECT * FROM teachers WHERE id = ?', [userId]);
    const isMatch = await bcrypt.compare(currentPassword, users[0].password);

    if (!isMatch) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.execute('UPDATE teachers SET password = ? WHERE id = ?', [hashedPassword, userId]);

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { name, phone, department, subject } = req.body;
    const userId = req.user.id;

    await db.execute(
      'UPDATE teachers SET name = ?, phone = ?, department = ?, subject = ? WHERE id = ?',
      [name, phone, department, subject, userId]
    );

    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { login, requestPasswordReset, resetPassword, changePassword, updateProfile };