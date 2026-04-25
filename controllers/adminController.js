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

const getAdminStats = async (req, res) => {
  try {
    const now = new Date();
    const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsersWeek,
      newUsersMonth,
      usersByTier,
      totalPosts,
      publicPosts,
      newPostsWeek,
      newPostsMonth,
      postsWithChallenge,
      totalChallenges,
      activeChallenges,
      completedChallenges,
      topUsers,
      topPosts
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: last7Days } }),
      User.countDocuments({ createdAt: { $gte: last30Days } }),
      User.aggregate([
        { $group: { _id: '$forgeTier', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      Post.countDocuments(),
      Post.countDocuments({ privacy: 'public' }),
      Post.countDocuments({ createdAt: { $gte: last7Days } }),
      Post.countDocuments({ createdAt: { $gte: last30Days } }),
      Post.countDocuments({ challengeId: { $exists: true, $ne: null } }),
      Challenge.countDocuments(),
      Challenge.countDocuments({ isActive: true }),
      Challenge.countDocuments({ isActive: false, winnerId: { $exists: true, $ne: null } }),
      User.find()
        .sort({ forgeScore: -1 })
        .limit(5)
        .select('_id username avatar forgeScore forgeTier'),
      Post.aggregate([
        { $match: { privacy: 'public' } },
        {
          $addFields: {
            avgRating: { $ifNull: [{ $avg: '$ratings.value' }, 0] }
          }
        },
        { $sort: { avgRating: -1, createdAt: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: 'users',
            localField: 'userId',
            foreignField: '_id',
            as: 'authorData'
          }
        },
        {
          $project: {
            _id: 1,
            imageUrl: {
              $ifNull: [
                '$imageUrl',
                {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ['$imageUrls', []] } }, 0] },
                    { $arrayElemAt: ['$imageUrls', 0] },
                    null
                  ]
                }
              ]
            },
            title: 1,
            avgRating: 1,
            authorUsername: { $arrayElemAt: ['$authorData.username', 0] }
          }
        }
      ])
    ]);

    res.status(200).json({
      users: {
        total: totalUsers,
        newLast7Days: newUsersWeek,
        newLast30Days: newUsersMonth,
        byTier: usersByTier.map((t) => ({ tier: t._id, count: t.count }))
      },
      posts: {
        total: totalPosts,
        public: publicPosts,
        newLast7Days: newPostsWeek,
        newLast30Days: newPostsMonth,
        withChallenge: postsWithChallenge
      },
      challenges: {
        total: totalChallenges,
        active: activeChallenges,
        completed: completedChallenges,
        totalParticipations: postsWithChallenge
      },
      topUsers: topUsers.map((u) => ({
        _id: u._id,
        username: u.username,
        avatar: u.avatar,
        forgeScore: u.forgeScore,
        forgeTier: u.forgeTier
      })),
      topPosts
    });
  } catch (error) {
    res.status(500).json({
      message: 'Error al obtener estadísticas',
      error: error.message
    });
  }
};

const getStats = getAdminStats;

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
  getAdminStats,
  getStats,
  blockUser,
  listAllPosts,
  adminDeletePost,
  adminDeleteAnalysis,
  adminDeleteComment,
  listAllAnalyses,
  listAllChallenges
};
