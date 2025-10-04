const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const { logActivity } = require('../middleware/logger');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    
    // Try database authentication first
    try {
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
        '994619ae2c8de2af7bf429ee59f81255449cc8446c7835377534c95f944231f9',
        { expiresIn: '24h' }
      );

      // Try to log activity, but don't fail login if logging fails
      try {
        await logActivity(teacher.id, 'LOGIN', 'auth', teacher.id, null, req.ip);
      } catch (logError) {
        console.error('Failed to log login activity:', logError);
        // Continue with login even if logging fails
      }

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
      return;
    } catch (dbError) {
      console.error('Database authentication failed, trying fallback:', dbError.message);
      
      // Fallback authentication for demo accounts when database is unavailable
      const fallbackAccounts = {
        'admin@school.com': { 
          password: 'password', 
          user: { id: 1, name: 'Admin User', email: 'admin@school.com', role: 'admin', department: 'Administration', subject: null }
        },
        'john@school.com': { 
          password: 'password', 
          user: { id: 2, name: 'John Doe', email: 'john@school.com', role: 'teacher', department: 'Mathematics', subject: 'Algebra' }
        }
      };
      
      const account = fallbackAccounts[email];
      if (account && account.password === password) {
        const token = jwt.sign(
          { id: account.user.id, email: account.user.email, role: account.user.role, name: account.user.name },
          '994619ae2c8de2af7bf429ee59f81255449cc8446c7835377534c95f944231f9',
          { expiresIn: '24h' }
        );

        console.log(`✅ Fallback login successful for ${email}`);
        
        res.json({
          token,
          user: account.user,
          fallback: true // Indicate this was a fallback login
        });
        return;
      }
      
      // If fallback also fails, return invalid credentials
      return res.status(401).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
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