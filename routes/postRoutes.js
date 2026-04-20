const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

const {
	createPost,
	getAllPosts,
	getPostById,
	updatePost,
	ratePost,
	addComment,
	updateComment,
	savePost,
	deletePost,
	deleteComment
} = require('../controllers/postController');
const { getCoachFeedback } = require('../controllers/coachController');
const { protect } = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const blockCheck = require('../middleware/blockCheck');
const { uploadPostImages, uploadPostImage } = require('../middleware/upload');
const requireOwner = require('../middleware/requireOwner');
const Post = require('../models/Post');

const rateLimitersEnabled = process.env.NODE_ENV !== 'test' || process.env.ENABLE_RATE_LIMITERS === 'true';

// Rate limiter específico para el endpoint coach (5 peticiones por minuto por IP)
const coachLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 5,
	message: { success: false, error: 'Too many coach requests, please wait a moment' },
	standardHeaders: true,
	legacyHeaders: false,
});

router.post('/', protect, blockCheck, uploadPostImages, createPost);
router.get('/', optionalAuth, getAllPosts);
router.get('/:id', optionalAuth, getPostById);
router.post('/:id/rate', protect, blockCheck, ratePost);
router.post('/:id/comment', protect, blockCheck, uploadPostImage, addComment);
router.delete('/:id', protect, blockCheck, requireOwner((req) => Post.findById(req.params.id)), deletePost);
router.delete('/:postId/comments/:commentId', protect, blockCheck, deleteComment);

router.patch('/:id', protect, blockCheck, uploadPostImages, updatePost);
router.post('/:id/save', protect, blockCheck, savePost);
router.patch('/:postId/comments/:commentId', protect, blockCheck, uploadPostImage, updateComment);
router.post('/:id/coach', protect, ...(rateLimitersEnabled ? [coachLimiter] : []), getCoachFeedback);

module.exports = router;
