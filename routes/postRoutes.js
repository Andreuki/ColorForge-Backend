const express = require('express');
const router = express.Router();

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
const { protect } = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const blockCheck = require('../middleware/blockCheck');
const { uploadPostImages, uploadPostImage } = require('../middleware/upload');
const requireOwner = require('../middleware/requireOwner');
const Post = require('../models/Post');

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

router.post('/:id/coach', protect, async (req, res) => {
	try {
		const post = await Post.findById(req.params.id);
		if (!post) return res.status(404).json({ success: false, error: 'Post not found' });

		const imageUrl = post.imageUrls?.[0] ?? post.imageUrl;
		if (!imageUrl) return res.status(400).json({ success: false, error: 'Post has no image' });

		const fs = require('fs');
		const path = require('path');

		let uploadPath = imageUrl;
		if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
			uploadPath = new URL(imageUrl).pathname;
		}

		const relativePath = uploadPath.startsWith('/') ? uploadPath.slice(1) : uploadPath;
		const filePath = path.join(__dirname, '..', relativePath);

		if (!fs.existsSync(filePath)) {
			return res.status(400).json({ success: false, error: 'Image file not found' });
		}

		const imageData = fs.readFileSync(filePath).toString('base64');
		const mimeType = relativePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

		const { GoogleGenerativeAI } = require('@google/generative-ai');
		const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
		const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

		const prompt = `Eres un pintor de miniaturas experto y amable. Analiza esta miniatura pintada y da feedback constructivo en espanol. Estructura tu respuesta asi:
1. **Lo que esta bien**: Menciona 2-3 aspectos positivos concretos de la pintura.
2. **Areas de mejora**: Sugiere 2-3 tecnicas especificas para mejorar (lavados, perfilado, blending, etc.).
3. **Proximo paso recomendado**: Un unico consejo concreto para el siguiente nivel.
Se alentador y especifico. Maximo 200 palabras.`;

		const result = await model.generateContent([
			{ inlineData: { data: imageData, mimeType } },
			prompt
		]);

		const feedback = result.response.text();
		res.status(200).json({ success: true, feedback });
	} catch (err) {
		res.status(500).json({ success: false, error: err.message });
	}
});

module.exports = router;
