const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/authMiddleware');
const { getUserPaints, addPaint, deleteUserPaint, updateUserPaint } = require('../controllers/paintController');

router.get('/', protect, getUserPaints);
router.post('/', protect, addPaint);
router.delete('/:id', protect, deleteUserPaint);
router.patch('/:id', protect, updateUserPaint);

module.exports = router;
