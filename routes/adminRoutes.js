const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const requireAdmin = require('../middleware/requireAdmin');
const adminController = require('../controllers/adminController');

router.get('/stats', protect, requireAdmin, adminController.getStats);

router.get('/users', protect, requireAdmin, adminController.listUsers);
router.patch('/users/:id', protect, requireAdmin, adminController.updateUser);
router.patch('/users/:id/block', protect, requireAdmin, adminController.blockUser);

router.get('/posts', protect, requireAdmin, adminController.listAllPosts);
router.get('/publications', protect, requireAdmin, adminController.listAllPosts);
router.delete('/posts/:id', protect, requireAdmin, adminController.adminDeletePost);
router.delete('/posts/:postId/comments/:commentId', protect, requireAdmin, adminController.adminDeleteComment);

router.get('/analyses', protect, requireAdmin, adminController.listAllAnalyses);
router.delete('/analyses/:id', protect, requireAdmin, adminController.adminDeleteAnalysis);

router.get('/challenges', protect, requireAdmin, adminController.listAllChallenges);

module.exports = router;