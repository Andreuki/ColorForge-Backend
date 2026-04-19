const express = require('express');
const router = express.Router();

const Paint = require('../models/Paint');
const User = require('../models/User');
const { protect } = require('../middleware/authMiddleware');

router.get('/', async (req, res) => {
  try {
    const { search, brand, type, colorFamily } = req.query;
    const filter = {};

    if (search) filter.name = { $regex: search, $options: 'i' };
    if (brand) filter.brand = brand;
    if (type) filter.type = type;
    if (colorFamily) filter.colorFamily = colorFamily;

    const paints = await Paint.find(filter).sort({ brand: 1, name: 1 });
    res.status(200).json({ success: true, data: paints });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/my-inventory', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate('ownedPaints.paintId');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.status(200).json({ success: true, data: user.ownedPaints || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/my-inventory', protect, async (req, res) => {
  try {
    const { paintId, action, status } = req.body;

    if (!paintId || !action) {
      return res.status(400).json({ success: false, error: 'paintId and action are required' });
    }

    if (action === 'add') {
      const user = await User.findById(req.user._id);
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const already = (user.ownedPaints || []).some((p) => p.paintId && p.paintId.toString() === paintId);
      if (!already) {
        user.ownedPaints.push({ paintId, status: status || 'Full' });
        await user.save();
      }
    } else if (action === 'remove') {
      await User.findByIdAndUpdate(req.user._id, {
        $pull: { ownedPaints: { paintId } }
      });
    } else if (action === 'updateStatus') {
      await User.findOneAndUpdate(
        { _id: req.user._id, 'ownedPaints.paintId': paintId },
        { $set: { 'ownedPaints.$.status': status } }
      );
    } else {
      return res.status(400).json({ success: false, error: 'Invalid action' });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
