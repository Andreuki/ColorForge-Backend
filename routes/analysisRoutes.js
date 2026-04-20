const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const {
	createAnalysis,
	getUserAnalyses,
	getAnalysisById,
	updateAnalysisTitle,
	deleteAnalysis
} = require('../controllers/analysisController');
const { protect } = require('../middleware/authMiddleware');
const requireOwner = require('../middleware/requireOwner');
const Analysis = require('../models/Analysis');
const upload = require('../middleware/upload');

const isTest = process.env.NODE_ENV === 'test';
const rateLimitersEnabled = !isTest || process.env.ENABLE_RATE_LIMITERS === 'true';

const analysisLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 20,
	message: { success: false, error: 'Límite de análisis alcanzado. Intenta en 1 hora.' },
	standardHeaders: true,
	legacyHeaders: false,
});

const coachAnalysisLimiter = rateLimit({
	windowMs: 60 * 1000,
	max: 5,
	message: { success: false, error: 'Too many coach requests, please wait a moment' },
	standardHeaders: true,
	legacyHeaders: false,
});

// El campo del FormData debe llamarse "image"
router.post('/', protect, ...(rateLimitersEnabled ? [analysisLimiter] : []), upload.single('image'), createAnalysis);
router.get('/', protect, getUserAnalyses);
router.post(
	'/:id/coach',
	protect,
	...(rateLimitersEnabled ? [coachAnalysisLimiter] : []),
	upload.single('image'),
	async (req, res) => {
		try {
			const analysis = await Analysis.findById(req.params.id);
			if (!analysis) {
				return res.status(404).json({ success: false, error: 'Analysis not found' });
			}

			if (analysis.userId.toString() !== req.user._id.toString()) {
				return res.status(403).json({ success: false, error: 'Forbidden' });
			}

			let filePath;

			if (req.file) {
				filePath = req.file.path;
			} else {
				let imageRef = analysis.imageUrl;
				if (!imageRef) {
					return res.status(400).json({ success: false, error: 'No image available for this analysis' });
				}

				if (imageRef.startsWith('http://') || imageRef.startsWith('https://')) {
					imageRef = new URL(imageRef).pathname;
				}

				const relative = imageRef.startsWith('/') ? imageRef.slice(1) : imageRef;
				filePath = path.join(__dirname, '..', relative);
			}

			if (!fs.existsSync(filePath)) {
				return res.status(400).json({ success: false, error: 'Image file not found on server' });
			}

			const imageData = fs.readFileSync(filePath).toString('base64');
			const ext = filePath.toLowerCase();
			const mimeType = ext.endsWith('.png') ? 'image/png'
				: ext.endsWith('.webp') ? 'image/webp'
				: 'image/jpeg';

			const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
			const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

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
	}
);
router.get('/:id', protect, getAnalysisById);
router.patch('/:id', protect, requireOwner((req) => Analysis.findById(req.params.id)), updateAnalysisTitle);
router.delete('/:id', protect, requireOwner((req) => Analysis.findById(req.params.id)), deleteAnalysis);

module.exports = router;
