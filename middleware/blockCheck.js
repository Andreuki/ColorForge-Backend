const blockCheck = (req, res, next) => {
  if (req.user && req.user.isBlocked) {
    return res.status(403).json({ success: false, error: 'Your account has been blocked' });
  }

  next();
};

module.exports = blockCheck;
