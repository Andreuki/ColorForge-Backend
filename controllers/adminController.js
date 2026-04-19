const Analysis = require('../models/Analysis');
const Post = require('../models/Post');
const Challenge = require('../models/Challenge');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

const listUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const { search, role, isBlocked } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (role && ['user', 'admin'].includes(role)) {
      filter.role = role;
    }

    if (isBlocked !== undefined) {
      filter.isBlocked = isBlocked === 'true';
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      User.countDocuments(filter)
    ]);

    res.status(200).json({ users, total, page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const { role, active } = req.body;
    const updates = {};

    if (req.params.id === req.user._id.toString() && active === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    if (role !== undefined) {
      if (!['user', 'admin'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role value' });
      }
      updates.role = role;
    }

    if (active !== undefined) {
      if (typeof active !== 'boolean') {
        return res.status(400).json({ error: 'Active must be a boolean' });
      }
      updates.active = active;
    }

    const updated = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    }).select('-password');

    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getStats = async (req, res) => {
  try {
    const [totalUsers, totalAnalyses, totalPosts] = await Promise.all([
      User.countDocuments(),
      Analysis.countDocuments(),
      Post.countDocuments()
    ]);

    const postsWithComments = await Post.aggregate([
      { $project: { count: { $size: '$comments' } } },
      { $group: { _id: null, total: { $sum: '$count' } } }
    ]);

    const totalComments = postsWithComments[0]?.total || 0;

    res.status(200).json({ totalUsers, totalAnalyses, totalPosts, totalComments });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const blockUser = async (req, res) => {
  try {
    const { isBlocked } = req.body;
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'Cannot block yourself' });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isBlocked } },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const listAllPosts = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const { search, privacy, faction } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (privacy && ['public', 'followers', 'private'].includes(privacy)) {
      filter.privacy = privacy;
    }

    if (faction) {
      filter.faction = { $regex: faction, $options: 'i' };
    }

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .populate('userId', 'username avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Post.countDocuments(filter)
    ]);

    const normalized = posts.map((p) => {
      const obj = p.toObject();
      if ((!obj.imageUrls || obj.imageUrls.length === 0) && obj.imageUrl) {
        obj.imageUrls = [obj.imageUrl];
      }
      return obj;
    });

    res.status(200).json({ success: true, data: normalized, total, page, limit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const adminDeletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const imageUrls = Array.isArray(post.imageUrls) && post.imageUrls.length
      ? post.imageUrls
      : post.imageUrl
        ? [post.imageUrl]
        : [];

    for (const imgUrl of imageUrls) {
      if (!imgUrl || imgUrl.startsWith('http')) continue;
      const filePath = path.join(__dirname, '..', imgUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const adminDeleteAnalysis = async (req, res) => {
  try {
    const analysis = await Analysis.findById(req.params.id);
    if (!analysis) return res.status(404).json({ success: false, error: 'Analysis not found' });

    if (analysis.imageUrl && !analysis.imageUrl.startsWith('http')) {
      const filePath = path.join(__dirname, '..', analysis.imageUrl);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await Analysis.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const adminDeleteComment = async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    await Post.findByIdAndUpdate(req.params.postId, {
      $pull: { comments: { _id: req.params.commentId } }
    });
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const listAllAnalyses = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const { search, faction } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'miniatureIdentification.specificUnit': { $regex: search, $options: 'i' } },
        { 'miniatureIdentification.detectedFaction': { $regex: search, $options: 'i' } }
      ];
    }

    if (faction) {
      filter['miniatureIdentification.detectedFaction'] = { $regex: faction, $options: 'i' };
    }

    const [analyses, total] = await Promise.all([
      Analysis.find(filter)
        .populate('userId', 'username avatar')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Analysis.countDocuments(filter)
    ]);

    res.status(200).json({ success: true, data: analyses, total, page, limit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const listAllChallenges = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const { search, status } = req.query;

    const filter = {};

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (status === 'active') filter.isActive = true;
    if (status === 'past') filter.isActive = false;

    const [challenges, total] = await Promise.all([
      Challenge.find(filter)
        .populate('winnerId', 'username avatar forgeTier')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Challenge.countDocuments(filter)
    ]);

    res.status(200).json({ success: true, data: challenges, total, page, limit });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  listUsers,
  updateUser,
  getStats,
  blockUser,
  listAllPosts,
  adminDeletePost,
  adminDeleteAnalysis,
  adminDeleteComment,
  listAllAnalyses,
  listAllChallenges
};
