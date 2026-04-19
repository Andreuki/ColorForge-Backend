const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const blockCheck = require('../middleware/blockCheck');
const requireAdmin = require('../middleware/requireAdmin');
const { uploadAvatar } = require('../middleware/upload');
const userController = require('../controllers/userController');
const adminController = require('../controllers/adminController');
const User = require('../models/User');

router.get('/me', protect, blockCheck, userController.getMe);
router.patch('/me', protect, blockCheck, userController.updateMe);
router.patch('/me/password', protect, blockCheck, userController.updatePassword);
router.post('/me/avatar', protect, blockCheck, uploadAvatar, userController.uploadAvatar);
router.delete('/me', protect, userController.deleteMyAccount);

router.get('/admin/users', protect, requireAdmin, adminController.listUsers);
router.patch('/admin/users/:id', protect, requireAdmin, adminController.updateUser);
router.patch('/admin/users/:id/block', protect, requireAdmin, adminController.blockUser);
router.get('/admin/stats', protect, requireAdmin, adminController.getStats);
router.get('/admin/posts', protect, requireAdmin, adminController.listAllPosts);
router.delete('/admin/posts/:id', protect, requireAdmin, adminController.adminDeletePost);
router.get('/admin/analyses', protect, requireAdmin, adminController.listAllAnalyses);
router.delete('/admin/analyses/:id', protect, requireAdmin, adminController.adminDeleteAnalysis);
router.delete('/admin/posts/:postId/comments/:commentId', protect, requireAdmin, adminController.adminDeleteComment);

router.get('/ranking', async (req, res) => {
	try {
		const users = await User.find({ isDeleted: { $ne: true }, active: true })
			.select('username avatar forgeScore forgeTier')
			.sort({ forgeScore: -1 })
			.limit(20);

		res.status(200).json({ success: true, data: users });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

// Endpoint canónico para perfil ajeno: GET /api/users/profile/:id
// Este endpoint /:id se mantiene para otras operaciones de usuario
router.get('/profile/:id', protect, blockCheck, userController.getUserById);

router.get('/:id', protect, blockCheck, userController.getUserById);

router.post('/:id/follow', protect, blockCheck, userController.followUser);
router.get('/:id/posts', optionalAuth, userController.getUserPosts);
router.get('/:id/followers', userController.getFollowers);
router.get('/:id/following', userController.getFollowing);

module.exports = router;
