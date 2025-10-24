// Rate limiting completely disabled - no connection limits
const loginLimiter = (req, res, next) => {
  // No rate limiting - allow unlimited login attempts
  next();
};

const apiLimiter = (req, res, next) => {
  // No rate limiting - allow unlimited API requests
  next();
};

module.exports = { loginLimiter, apiLimiter };
