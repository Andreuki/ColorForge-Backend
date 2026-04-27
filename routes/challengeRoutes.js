const express = require('express');
const router = express.Router();

const Challenge = require('../models/Challenge');
const Post = require('../models/Post');
const { protect } = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const { uploadChallengeCover } = require('../middleware/upload');

router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};

    if (status === 'active') filter.isActive = true;
    if (status === 'past') filter.isActive = false;

    const challenges = await Challenge.find(filter)
      .populate('winnerId', 'username avatar forgeTier')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: challenges });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/public', async (req, res) => {
  try {
    const now = new Date();
    const challenges = await Challenge.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    })
      .populate('winnerId', 'username avatar forgeTier')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, data: challenges });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/active', async (req, res) => {
  try {
    const challenge = await Challenge.findOne({ isActive: true })
      .sort({ createdAt: -1 });

    if (!challenge) {
      return res.status(200).json({ success: true, data: null });
    }

    // Si el reto activo ya expiró, desactivarlo ahora mismo
    // (el cron lo haría a las 00:05, pero así es inmediato)
    const now = new Date();
    if (challenge.endDate < now) {
      await Challenge.findByIdAndUpdate(challenge._id, { isActive: false });
      return res.status(200).json({ success: true, data: null });
    }

    res.status(200).json({ success: true, data: challenge });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id/posts', async (req, res) => {
  try {
    const posts = await Post.find({ challengeId: req.params.id, privacy: 'public' })
      .populate('userId', 'username avatar forgeTier')
      .sort({ createdAt: -1 });

    const normalized = posts.map((p) => {
      const obj = p.toObject();
      if ((!obj.imageUrls || obj.imageUrls.length === 0) && obj.imageUrl) obj.imageUrls = [obj.imageUrl];
      if (!obj.imageUrl && Array.isArray(obj.imageUrls) && obj.imageUrls.length > 0) {
        obj.imageUrl = obj.imageUrls[0];
      }
      if (obj.userId) {
        obj.author = {
          _id: obj.userId._id,
          username: obj.userId.username,
          avatar: obj.userId.avatar
        };
      } else {
        obj.author = null;
      }
      return obj;
    });

    res.status(200).json({ success: true, data: normalized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const challenge = await Challenge.findById(req.params.id)
      .populate('winnerId', 'username avatar forgeTier');

    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    res.status(200).json({ success: true, data: challenge });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', protect, requireAdmin, uploadChallengeCover, async (req, res) => {
  try {
    const { title, description, startDate, endDate, badge } = req.body;

    if (!title || !description || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: 'title, description, startDate and endDate are required'
      });
    }

    const imageUrl = req.file ? `/uploads/challenges/${req.file.filename}` : null;

    const challenge = await Challenge.create({
      title,
      description,
      imageUrl,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      badge: badge || `🏆 Campeon: ${title}`,
      createdBy: req.user._id
    });

    res.status(201).json({ success: true, data: challenge });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id', protect, requireAdmin, uploadChallengeCover, async (req, res) => {
  try {
    const { title, description, startDate, endDate, isActive, badge } = req.body;
    const updates = {};

    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (startDate !== undefined) updates.startDate = new Date(startDate);
    if (endDate !== undefined) updates.endDate = new Date(endDate);
    if (isActive !== undefined) {
      // Aceptar tanto boolean como string 'true'/'false' (viene de FormData)
      updates.isActive = isActive === true || isActive === 'true';
    }
    if (badge !== undefined) updates.badge = badge;

    // Si se subió una nueva imagen de portada, actualizar imageUrl
    if (req.file) {
      updates.imageUrl = `/uploads/challenges/${req.file.filename}`;
    }

    const updated = await Challenge.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Challenge not found' });
    }

    res.status(200).json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch('/:id/link-posts', protect, requireAdmin, async (req, res) => {
  try {
    const { postIds } = req.body;

    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'postIds debe ser un array no vacío de IDs'
      });
    }

    const challenge = await Challenge.findById(req.params.id);
    if (!challenge) {
      return res.status(404).json({ success: false, error: 'Reto no encontrado' });
    }

    const result = await Post.updateMany(
      { _id: { $in: postIds } },
      { $set: { challengeId: challenge._id } }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} publicación(es) vinculada(s) al reto`,
      data: { modifiedCount: result.modifiedCount }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', protect, requireAdmin, async (req, res) => {
  try {
    await Challenge.findByIdAndDelete(req.params.id);
    await Post.updateMany({ challengeId: req.params.id }, { $set: { challengeId: null } });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
