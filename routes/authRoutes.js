const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const { register, login, getMe, googleAuth } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/mailer');

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleAuth);
router.get('/me', protect, getMe);

router.post('/forgot-password', async (req, res) => {
	try {
		const { email } = req.body;
		if (!email) return res.status(400).json({ error: 'Email is required' });

		const user = await User.findOne({ email: email.toLowerCase() });
		if (!user || user.isDeleted) {
			return res.status(200).json({ message: 'If the email exists, you will receive an email shortly' });
		}

		const token = crypto.randomBytes(32).toString('hex');
		const expires = new Date(Date.now() + 60 * 60 * 1000);

		await User.findByIdAndUpdate(user._id, {
			resetPasswordToken: token,
			resetPasswordExpires: expires
		});

		const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
		await sendPasswordResetEmail(user.email, resetUrl);

		res.status(200).json({ message: 'If the email exists, you will receive an email shortly' });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

router.post('/reset-password', async (req, res) => {
	try {
		const { token, password } = req.body;
		if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
		if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

		const user = await User.findOne({
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: new Date() }
		});

		if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

		const hashed = await bcrypt.hash(password, 10);

		await User.findByIdAndUpdate(user._id, {
			password: hashed,
			resetPasswordToken: null,
			resetPasswordExpires: null
		});

		res.status(200).json({ message: 'Password updated successfully' });
	} catch (err) {
		res.status(500).json({ error: err.message });
	}
});

module.exports = router;
