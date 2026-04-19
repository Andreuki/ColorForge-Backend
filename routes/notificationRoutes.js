const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const { protect } = require('../middleware/authMiddleware');
const blockCheck = require('../middleware/blockCheck');

router.get('/', protect, blockCheck, async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user._id })
      .populate('senderId', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipientId: req.user._id,
      read: false
    });

    res.status(200).json({ success: true, data: notifications, unreadCount });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id/read', protect, blockCheck, async (req, res) => {
  try {
    await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user._id },
      { read: true }
    );
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/read-all', protect, blockCheck, async (req, res) => {
  try {
    await Notification.updateMany({ recipientId: req.user._id }, { read: true });
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', protect, blockCheck, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({ success: false, error: 'Notification not found' });
    }

    if (notification.recipientId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await Notification.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/', protect, blockCheck, async (req, res) => {
  try {
    await Notification.deleteMany({ recipientId: req.user._id });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
