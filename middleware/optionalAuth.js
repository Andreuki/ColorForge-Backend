const jwt = require('jsonwebtoken');
const User = require('../models/User');

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (user) {
      req.user = user;
    }

    next();
  } catch (error) {
    next();
  }
};

module.exports = optionalAuth;
