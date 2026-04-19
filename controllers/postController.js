const Post = require('../models/Post');
const Analysis = require('../models/Analysis');
const User = require('../models/User');
const Notification = require('../models/Notification');
const fs = require('fs');
const path = require('path');
const { awardPoints } = require('../utils/forgeScore');

const parseArrayField = (value) => {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
};

const normalizePost = (post) => {
  const obj = typeof post.toObject === 'function' ? post.toObject() : post;
  if ((!obj.imageUrls || obj.imageUrls.length === 0) && obj.imageUrl) {
    obj.imageUrls = [obj.imageUrl];
  }
  return obj;
};

const hydrateLegacyImageUrls = (post) => {
  if (post && (!post.imageUrls || post.imageUrls.length === 0) && post.imageUrl) {
    post.imageUrls = [post.imageUrl];
  }
};

const toRelativeUploadsPath = (value) => {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  if (value.startsWith('/uploads/')) {
    return value;
  }

  if (value.startsWith('http://') || value.startsWith('https://')) {
    try {
      const pathname = new URL(value).pathname;
      return pathname.startsWith('/uploads/') ? pathname : null;
    } catch (error) {
      return null;
    }
  }

  return value.startsWith('uploads/') ? `/${value}` : null;
};

// ─── POST /api/posts  (protected) ────────────────────────────────────────────
const createPost = async (req, res) => {
  try {
    const { description, title, techniques, colors, privacy, faction, analysisId, challengeId } = req.body;

    let imageUrls = [];

    if (Array.isArray(req.files) && req.files.length > 0) {
      imageUrls = req.files.map((f) => `/uploads/posts/${f.filename}`);
    } else if (analysisId) {
      const analysis = await Analysis.findById(analysisId).select('userId imageUrl');

      if (!analysis) {
        return res.status(400).json({ success: false, error: 'Analysis not found' });
      }

      if (analysis.userId.toString() !== req.user._id.toString()) {
        return res.status(403).json({ success: false, error: 'Cannot publish a post from another user analysis' });
      }

      const analysisImage = toRelativeUploadsPath(analysis.imageUrl);

      if (!analysisImage) {
        return res.status(400).json({ success: false, error: 'Analysis image is invalid or unavailable' });
      }

      imageUrls = [analysisImage];
    }

    if (imageUrls.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one image is required or provide a valid analysisId' });
    }

    const post = await Post.create({
      userId: req.user._id,
      imageUrls,
      description: description || '',
      title: title || '',
      techniques: parseArrayField(techniques),
      colors: parseArrayField(colors),
      privacy: privacy || 'public',
      faction: faction || '',
      analysisId: analysisId || null,
      challengeId: challengeId || null
    });

    await awardPoints(req.user._id, 'PUBLISH_POST');

    res.status(201).json({ success: true, data: post });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/posts  (público) ────────────────────────────────────────────────
const getAllPosts = async (req, res) => {
  try {
    const { userId, faction, technique, privacy, page = 1, limit = 12, sort = 'recent' } = req.query;
    const pageNumber = Math.max(Number(page) || 1, 1);
    const limitNumber = Math.max(Number(limit) || 12, 1);

    const filter = {};

    if (req.user) {
      const currentUser = await User.findById(req.user._id).select('following');
      const followingIds = currentUser?.following || [];
      filter.$or = [
        { privacy: 'public' },
        { privacy: 'followers', userId: { $in: followingIds } },
        { privacy: 'private', userId: req.user._id }
      ];
    } else {
      filter.privacy = 'public';
    }

    if (userId) filter.userId = userId;
    if (faction) filter.faction = { $regex: faction, $options: 'i' };
    if (technique) filter.techniques = { $in: [technique] };
    if (privacy) filter.privacy = privacy;

    const sortOption = sort === 'top' ? { 'ratings.value': -1 } : { createdAt: -1 };

    const posts = await Post.find(filter)
      .sort({ createdAt: -1 })
      .populate('userId', 'username avatar')
      .populate('comments.userId', 'username avatar');

    const sortedPosts = posts
      .sort((a, b) => {
        if (sortOption.createdAt) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        const avgA = a.ratings.length ? a.ratings.reduce((sum, r) => sum + r.value, 0) / a.ratings.length : 0;
        const avgB = b.ratings.length ? b.ratings.reduce((sum, r) => sum + r.value, 0) / b.ratings.length : 0;
        return avgB - avgA;
      })
      .slice((pageNumber - 1) * limitNumber, pageNumber * limitNumber);

    const normalized = sortedPosts.map((post) => {
      const obj = normalizePost(post);
      const totalVotes = obj.ratings.length;
      const avgRating =
        totalVotes > 0
          ? parseFloat((obj.ratings.reduce((sum, r) => sum + r.value, 0) / totalVotes).toFixed(2))
          : 0;
      return { ...obj, totalVotes, avgRating };
    });

    const total = await Post.countDocuments(filter);
    res.status(200).json({ success: true, data: normalized, total, page: pageNumber, limit: limitNumber });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── GET /api/posts/:id  (público) ───────────────────────────────────────────
const getPostById = async (req, res, next) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('userId', 'username avatar')
      .populate('comments.userId', 'username avatar');

    if (!post) {
      return res.status(404).json({ success: false, message: 'Post no encontrado' });
    }

    if (post.privacy === 'private') {
      const isOwner = post.userId?._id?.toString() === req.user?._id?.toString();
      const isAdmin = req.user?.role === 'admin';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    if (post.privacy === 'followers') {
      if (!req.user) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const owner = await User.findById(post.userId._id).select('followers');
      const isOwner = post.userId?._id?.toString() === req.user._id.toString();
      const isFollower = owner?.followers?.some((id) => id.toString() === req.user._id.toString());
      const isAdmin = req.user.role === 'admin';
      if (!isOwner && !isFollower && !isAdmin) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
    }

    res.status(200).json({ success: true, data: normalizePost(post) });
  } catch (error) {
    next(error);
  }
};

// ─── POST /api/posts/:id/rate  (protected) ───────────────────────────────────
const ratePost = async (req, res) => {
  try {
    const { value } = req.body;
    const numValue = Number(value);

    if (!numValue || numValue < 1 || numValue > 5 || !Number.isInteger(numValue)) {
      return res.status(400).json({ success: false, message: 'La valoración debe ser un entero entre 1 y 5' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    hydrateLegacyImageUrls(post);

    const existingIndex = post.ratings.findIndex(
      (r) => r.userId.toString() === req.user._id.toString()
    );

    if (existingIndex >= 0) {
      post.ratings[existingIndex].value = numValue;
    } else {
      post.ratings.push({ userId: req.user._id, value: numValue });
    }

    if (post.userId.toString() !== req.user._id.toString()) {
      await awardPoints(post.userId, 'RECEIVE_RATING');
      const voter = await User.findById(req.user._id).select('username');
      await Notification.create({
        recipientId: post.userId,
        senderId: req.user._id,
        type: 'rating',
        postId: post._id,
        message: `${voter.username} ha valorado tu publicación`
      });
    }

    await post.save();

    res.status(200).json({ success: true, data: normalizePost(post) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── POST /api/posts/:id/comment  (protected) ────────────────────────────────
const commentPost = async (req, res, next) => {
  return addComment(req, res, next);
};

const addComment = async (req, res) => {
  try {
    const { text, link } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Comment text is required' });
    }

    const comment = {
      userId: req.user._id,
      text: text.trim(),
      link: link || null,
      imageUrl: req.file ? `/uploads/posts/${req.file.filename}` : null
    };

    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: comment } },
      { new: true }
    ).populate('comments.userId', 'username avatar');

    if (!updatedPost) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    if ((!updatedPost.imageUrls || updatedPost.imageUrls.length === 0) && updatedPost.imageUrl) {
      updatedPost.imageUrls = [updatedPost.imageUrl];
    }

    const newComment = updatedPost.comments[updatedPost.comments.length - 1];

    if (updatedPost.userId.toString() !== req.user._id.toString()) {
      await awardPoints(updatedPost.userId, 'RECEIVE_COMMENT');
      const commenter = await User.findById(req.user._id).select('username');
      await Notification.create({
        recipientId: updatedPost.userId,
        senderId: req.user._id,
        type: 'comment',
        postId: updatedPost._id,
        message: `${commenter.username} ha comentado tu publicación`
      });
    }

    res.status(201).json({ success: true, data: newComment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const updateComment = async (req, res) => {
  try {
    const { text, link } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Comment text is required' });
    }

    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });

    const isOwner = comment.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    comment.text = text.trim();
    if (link !== undefined) comment.link = link || null;
    
    // Manejar imagen: si hay nuevo archivo, actualizar; si no hay, mantener la existente
    if (req.file) {
      // Borrar imagen anterior si existe
      if (comment.imageUrl) {
        const oldPath = path.join(__dirname, '..', comment.imageUrl);
        if (fs.existsSync(oldPath)) {
          try { fs.unlinkSync(oldPath); } catch (e) { /* ignore */ }
        }
      }
      // Asignar nueva imagen
      comment.imageUrl = `/uploads/posts/${req.file.filename}`;
    }
    
    comment.editedAt = new Date();

    await post.save();
    
    // Populate userId para devolver usuario completo como en addComment
    await post.populate('comments.userId', 'username avatar');
    const updatedComment = post.comments.id(req.params.commentId);
    
    res.status(200).json({ success: true, data: updatedComment });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const updatePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const isOwner = post.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    if (!isOwner && !isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    const { title, description, techniques, colors, privacy, faction } = req.body;

    hydrateLegacyImageUrls(post);

    if (title !== undefined) post.title = title;
    if (description !== undefined) post.description = description;
    if (techniques !== undefined) post.techniques = parseArrayField(techniques);
    if (colors !== undefined) post.colors = parseArrayField(colors);
    if (privacy !== undefined) post.privacy = privacy;
    if (faction !== undefined) post.faction = faction;

    await post.save();
    res.status(200).json({ success: true, data: normalizePost(post) });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const savePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

    const alreadySaved = post.savedBy.some((id) => id.toString() === req.user._id.toString());

    const updatedPost = await Post.findByIdAndUpdate(
      req.params.id,
      alreadySaved
        ? { $pull: { savedBy: req.user._id } }
        : { $addToSet: { savedBy: req.user._id } },
      { new: true } // <<< Esto es lo crítico
    );

    res.status(200).json({ success: true, saved: !alreadySaved, post: updatedPost });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const deletePost = async (req, res) => {
  try {
    const post = req.resource;

    const imageList = Array.isArray(post.imageUrls) && post.imageUrls.length
      ? post.imageUrls
      : post.imageUrl
        ? [post.imageUrl]
        : [];

    for (const imageUrl of imageList) {
      if (typeof imageUrl !== 'string' || !imageUrl.includes('/uploads/')) continue;

      let pathname = imageUrl;

      if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
        pathname = new URL(imageUrl).pathname;
      }

      const uploadPath = pathname.split('?')[0];
      const relative = uploadPath.startsWith('/') ? uploadPath.slice(1) : uploadPath;
      const localPath = path.join(__dirname, '..', relative);

      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }

    await Post.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params;
    const post = await Post.findById(postId);

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const comment = post.comments.id(commentId);

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const isOwner = comment.userId.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: not allowed to delete this comment' });
    }

    await Post.findByIdAndUpdate(postId, { $pull: { comments: { _id: commentId } } });
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createPost,
  getAllPosts,
  getPostById,
  updatePost,
  ratePost,
  commentPost,
  addComment,
  updateComment,
  savePost,
  deletePost,
  deleteComment
};
