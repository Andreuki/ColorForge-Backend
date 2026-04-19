const requireOwner = (getResource) => async (req, res, next) => {
  try {
    const resource = await getResource(req);
    if (!resource) return res.status(404).json({ error: 'Resource not found' });

    const isOwner = resource.userId?.toString() === req.user._id?.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: not the owner' });
    }

    req.resource = resource;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = requireOwner;
