const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'riteshmudgil192004@gmail.com',
    pass: 'fayd nflh rrzh lrqy'
  }
});

const sendEmail = async (to, subject, html) => {
  try {
    if (!('riteshmudgil192004@gmail.com') || 'riteshmudgil192004@gmail.com' === 'your-email@gmail.com') {
      console.log('📧 Email not configured. Would send:', { to, subject });
      return { success: false, message: 'Email not configured' };
    }

    const info = await transporter.sendMail({
      from: 'My Schedule <noreply@school.com>',
      to,
      subject,
      html
    });

    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendWelcomeEmail = (email, name, password) => {
  const html = `
    <h2>Welcome to School Management System</h2>
    <p>Hi ${name},</p>
    <p>Your account has been created successfully.</p>
    <p><strong>Login Credentials:</strong></p>
    <p>Email: ${email}<br>Password: ${password}</p>
    <p>Please login and change your password immediately.</p>
    <p><a href="http://localhost:8080/login">Login Now</a></p>
  `;
  return sendEmail(email, 'Welcome to School Management', html);
};

const sendAbsenceNotification = (email, name, date, reason) => {
  const html = `
    <h2>Absence Notification</h2>
    <p>Hi ${name},</p>
    <p>You have been marked absent for <strong>${date}</strong>.</p>
    <p>Reason: ${reason || 'Not specified'}</p>
    <p>Coverage has been automatically assigned for your classes.</p>
  `;
  return sendEmail(email, 'Absence Notification', html);
};

const sendCoverageAssignment = (email, name, className, time, date) => {
  const html = `
    <h2>Coverage Assignment</h2>
    <p>Hi ${name},</p>
    <p>You have been assigned to cover a class:</p>
    <p><strong>Class:</strong> ${className}<br>
    <strong>Time:</strong> ${time}<br>
    <strong>Date:</strong> ${date}</p>
    <p><a href="http://localhost:8080/teacher">View Schedule</a></p>
  `;
  return sendEmail(email, 'Coverage Assignment', html);
};

const sendLeaveRequestNotification = (email, teacherName, startDate, endDate) => {
  const html = `
    <h2>New Leave Request</h2>
    <p>A new leave request has been submitted:</p>
    <p><strong>Teacher:</strong> ${teacherName}<br>
    <strong>Period:</strong> ${startDate} to ${endDate}</p>
    <p><a href="http://localhost:8080/admin">Review Request</a></p>
  `;
  return sendEmail(email, 'New Leave Request', html);
};

const sendLeaveStatusUpdate = (email, name, status, startDate, endDate) => {
  const html = `
    <h2>Leave Request ${status.toUpperCase()}</h2>
    <p>Hi ${name},</p>
    <p>Your leave request for ${startDate} to ${endDate} has been <strong>${status}</strong>.</p>
  `;
  return sendEmail(email, `Leave Request ${status}`, html);
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendAbsenceNotification,
  sendCoverageAssignment,
  sendLeaveRequestNotification,
  sendLeaveStatusUpdate
};
