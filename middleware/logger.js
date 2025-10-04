const db = require('../config/database');

const logActivity = async (userId, action, entityType = null, entityId = null, details = null, ipAddress = null) => {
  try {
    await db.execute(
      'INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, action, entityType, entityId, JSON.stringify(details), ipAddress]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

const activityLogger = (action, entityType = null) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    res.send = function(data) {
      if (res.statusCode < 400) {
        const userId = req.user?.id;
        const entityId = req.params?.id || req.body?.id;
        const ipAddress = req.ip || req.connection.remoteAddress;
        logActivity(userId, action, entityType, entityId, req.body, ipAddress);
      }
      originalSend.call(this, data);
    };
    next();
  };
};

module.exports = { logActivity, activityLogger };
