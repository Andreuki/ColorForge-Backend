const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

const { register, login, getMe, googleAuth } = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const User = require('../models/User');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { hashPassword } = require('../utils/crypto');

const rateLimitersEnabled = process.env.NODE_ENV !== 'test' || process.env.ENABLE_RATE_LIMITERS === 'true';

// Limiter para login: 10 intentos por IP cada 15 minutos
const loginLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: { success: false, error: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.' },
	standardHeaders: true,
	legacyHeaders: false,
});

// Limiter para forgot-password: 5 peticiones por IP cada hora
const forgotPasswordLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 5,
	message: { success: false, error: 'Demasiadas solicitudes de recuperación. Intenta en 1 hora.' },
	standardHeaders: true,
	legacyHeaders: false,
});

// Limiter para registro: 5 cuentas por IP cada hora
const registerLimiter = rateLimit({
	windowMs: 60 * 60 * 1000,
	max: 5,
	message: { success: false, error: 'Demasiados registros desde esta IP.' },
	standardHeaders: true,
	legacyHeaders: false,
});

router.post('/register', ...(rateLimitersEnabled ? [registerLimiter] : []), register);
router.post('/login', ...(rateLimitersEnabled ? [loginLimiter] : []), login);
router.post('/google', googleAuth);
router.get('/me', protect, getMe);

router.post('/forgot-password', ...(rateLimitersEnabled ? [forgotPasswordLimiter] : []), async (req, res) => {
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
		if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

		const user = await User.findOne({
			resetPasswordToken: token,
			resetPasswordExpires: { $gt: new Date() }
		});

		if (!user) return res.status(400).json({ error: 'Invalid or expired token' });

		const hashed = await hashPassword(password);

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
