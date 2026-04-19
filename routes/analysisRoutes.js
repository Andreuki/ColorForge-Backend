const express = require('express');
const router = express.Router();

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

// El campo del FormData debe llamarse "image"
router.post('/', protect, upload.single('image'), createAnalysis);
router.get('/', protect, getUserAnalyses);
router.get('/:id', protect, getAnalysisById);
router.patch('/:id', protect, requireOwner((req) => Analysis.findById(req.params.id)), updateAnalysisTitle);
router.delete('/:id', protect, requireOwner((req) => Analysis.findById(req.params.id)), deleteAnalysis);

module.exports = router;
