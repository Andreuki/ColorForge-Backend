const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const User = require('../models/User');
const Post = require('../models/Post');
const Notification = require('../models/Notification');
const { awardPoints } = require('../utils/forgeScore');
const { verifyFileMagicBytes } = require('../middleware/upload');
const { hashPassword } = require('../utils/crypto');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id || req.user._id).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updateMe = async (req, res) => {
  try {
    const { name, email } = req.body;
    const updates = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 50) {
        return res.status(400).json({ error: 'Name must be between 2 and 50 characters' });
      }
      updates.username = name.trim();
    }

    if (email !== undefined) {
      if (typeof email !== 'string' || !emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
      }

      const existing = await User.findOne({ email: email.toLowerCase(), _id: { $ne: req.user._id } });
      if (existing) {
        return res.status(409).json({ error: 'Email already in use' });
      }

      updates.email = email.toLowerCase().trim();
    }

    const updated = await User.findByIdAndUpdate(req.user._id, { $set: updates }, {
      new: true,
      runValidators: true
    }).select('-password');

    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({
      _id: updated._id,
      name: updated.username,
      email: updated.email,
      avatar: updated.avatar,
      role: updated.role,
      createdAt: updated.createdAt
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const updatePassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const hash = await hashPassword(password);
    await User.findByIdAndUpdate(req.user._id, { password: hash });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Avatar file is required' });
    }

    const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
    await verifyFileMagicBytes(req.file.path, allowedImageMimes);

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.avatar) {
      const relativeOldAvatar = user.avatar.replace(/^\//, '');
      const oldPath = path.join(__dirname, '..', relativeOldAvatar);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    await User.findByIdAndUpdate(
      req.user._id,
      { $set: { avatar: avatarUrl } },
      { new: true }
    );

    res.status(200).json({ avatarUrl });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -__v -resetPasswordToken -resetPasswordExpires -tokens');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const followUser = async (req, res) => {
  try {
    const targetId = req.params.id;

    if (targetId === req.user._id.toString()) {
      return res.status(400).json({ success: false, error: 'You cannot follow yourself' });
    }

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });

    const currentUser = await User.findById(req.user._id).select('following');
    const isFollowing = currentUser.following.some((id) => id.toString() === targetId);

    if (isFollowing) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { following: targetId } });
      await User.findByIdAndUpdate(targetId, { $pull: { followers: req.user._id } });
    } else {
      // Usar findByIdAndUpdate con { new: true } para obtener el estado actualizado
      // y verificar si el $addToSet realmente añadió el elemento.
      // Esto previene notificaciones duplicadas en caso de peticiones simultáneas.
      const updatedUser = await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { following: targetId } },
        { new: true }
      ).select('following');

      // Solo proceder si el follow fue realmente nuevo (el elemento está en el array)
      const followedSuccessfully = updatedUser.following.some(
        (id) => id.toString() === targetId
      );

      if (followedSuccessfully) {
        await User.findByIdAndUpdate(targetId, { $addToSet: { followers: req.user._id } });

        await awardPoints(targetId, 'RECEIVE_FOLLOWER');

        const follower = await User.findById(req.user._id).select('username');
        await Notification.create({
          recipientId: targetId,
          senderId: req.user._id,
          type: 'follow',
          message: `${follower.username} ha empezado a seguirte`
        });
      }
    }

    res.status(200).json({ success: true, following: !isFollowing });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const unfollowUser = async (req, res) => {
  try {
    const { id } = req.params;
    const currentUserId = req.user._id;

    if (id === currentUserId.toString()) {
      return res.status(400).json({ message: 'No puedes dejar de seguirte a ti mismo' });
    }

    const userToUnfollow = await User.findById(id);
    if (!userToUnfollow) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    await User.findByIdAndUpdate(currentUserId, {
      $pull: { following: id }
    });
    await User.findByIdAndUpdate(id, {
      $pull: { followers: currentUserId }
    });

    res.json({ message: 'Has dejado de seguir a este usuario' });
  } catch (error) {
    res.status(500).json({ message: 'Error al dejar de seguir', error: error.message });
  }
};

const getUserPosts = async (req, res) => {
  try {
    const filter = { userId: req.params.id };

    if (req.user) {
      const currentUser = await User.findById(req.user._id).select('following');
      const isFollowing = currentUser.following.some((id) => id.toString() === req.params.id);
      const isOwner = req.params.id === req.user._id.toString();

      if (!isOwner) {
        filter.$or = [
          { privacy: 'public' },
          ...(isFollowing ? [{ privacy: 'followers' }] : [])
        ];
      }
    } else {
      filter.privacy = 'public';
    }

    const posts = await Post.find(filter)
      .populate('userId', 'username avatar')
      .populate('comments.userId', 'username avatar')
      .sort({ createdAt: -1 });

    const normalized = posts.map((p) => {
      const obj = p.toObject();
      if ((!obj.imageUrls || obj.imageUrls.length === 0) && obj.imageUrl) {
        obj.imageUrls = [obj.imageUrl];
      }

      const totalVotes = obj.ratings ? obj.ratings.length : 0;
      const avgRating =
        totalVotes > 0
          ? parseFloat(
              (obj.ratings.reduce((sum, r) => sum + r.value, 0) / totalVotes).toFixed(2)
            )
          : 0;
      const commentsCount = obj.comments ? obj.comments.length : 0;
      const savedBy = obj.savedBy ? obj.savedBy.length : 0;

      return {
        ...obj,
        totalVotes,
        avgRating,
        commentsCount,
        savedCount: savedBy
      };
    });

    res.status(200).json({ success: true, data: normalized });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getFollowers = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('followers', '_id username avatar createdAt');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.status(200).json({ success: true, data: user.followers || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const getFollowing = async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('following', '_id username avatar createdAt');

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.status(200).json({ success: true, data: user.following || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

const deleteMyAccount = async (req, res) => {
  try {
    const userId = req.user._id;

    // Generar un hash bcrypt de una cadena aleatoria para el password,
    // nunca guardar plaintext. findByIdAndUpdate no ejecuta pre-save hooks,
    // así que necesitamos hashear el password explícitamente aquí.
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await hashPassword(randomPassword);

    await User.findByIdAndUpdate(userId, {
      $set: {
        username: `[Cuenta eliminada] ${userId.toString().slice(-6)}`,
        email: `deleted_${userId}@colorforge.deleted`,
        avatar: null,
        password: hashedPassword,
        isDeleted: true,
        active: false,
        bio: '',
        following: [],
        followers: []
      }
    });

    await User.updateMany(
      { following: userId },
      { $pull: { following: userId } }
    );

    await User.updateMany(
      { followers: userId },
      { $pull: { followers: userId } }
    );

    await Notification.deleteMany({
      $or: [{ recipientId: userId }, { senderId: userId }]
    });

    res.status(204).send();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

module.exports = {
  getMe,
  updateMe,
  updatePassword,
  uploadAvatar,
  getUserById,
  followUser,
  unfollowUser,
  getUserPosts,
  getFollowers,
  getFollowing,
  deleteMyAccount
};
