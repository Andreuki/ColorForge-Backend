const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { comparePassword } = require('../utils/crypto');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/** Genera un token JWT firmado con el id del usuario. */
const generateToken = (user) =>
  jwt.sign({
    id: user._id,
    _id: user._id
  }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  });

// ─── POST /api/auth/register ─────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { username, email, password } = req.body;

    // Comprobar email duplicado
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ success: false, message: 'El email ya está registrado' });
    }

    // El pre-save hook hashea la contraseña automáticamente
    const user = await User.create({ username, email, password });
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email y contraseña son obligatorios' });
    }

    // Consulta fresca con campos explícitos para evitar token/respuesta desactualizados.
    const user = await User.findOne({ email }).select(
      'username email password avatar role active isBlocked isDeleted createdAt'
    );

    if (!user) {
      // Mensaje genérico: no revelar si falló el email o la contraseña
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    }

    if (user.isDeleted) {
      return res.status(403).json({ error: 'This account has been deleted' });
    }

    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Tu cuenta ha sido bloqueada. Contacta con el administrador.' });
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Credenciales incorrectas' });
    }

    const token = generateToken(user);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          active: user.active,
          isBlocked: user.isBlocked,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/auth/me  (protected) ───────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        _id: user._id,
        name: user.username,
        email: user.email,
        avatar: user.avatar,
        role: user.role,
        active: user.active,
        forgeScore: user.forgeScore,
        forgeTier: user.forgeTier,
        badges: user.badges,
        followers: user.followers,      // array de ObjectIds
        following: user.following,      // array de ObjectIds
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── POST /api/auth/google  (public) ─────────────────────────────────────────
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, message: 'ID token is required' });
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ success: false, message: 'Google Client ID not configured' });
    }

    // Verify the ID token with Google
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const googleEmail = payload.email;
    const googleName = payload.name;
    const googlePicture = payload.picture;

    // Find or create user
    let user = await User.findOne({ email: googleEmail });

    if (!user) {
      // Create new user from Google data
      const username = googleName
        .toLowerCase()
        .replace(/\s+/g, '_')
        .slice(0, 20) || `user_${Date.now()}`;

      user = await User.create({
        username,
        email: googleEmail,
        password: `google_${googleId}_${Date.now()}`, // Password is not used for Google OAuth
        avatar: googlePicture || null
      });
    } else if (!user.avatar && googlePicture) {
      // Update avatar if user doesn't have one
      user.avatar = googlePicture;
      await user.save();
    }

    // Verificar que la cuenta no está eliminada
    if (user.isDeleted) {
      return res.status(403).json({ success: false, message: 'This account has been deleted' });
    }

    // Verificar que la cuenta no está bloqueada
    if (user.isBlocked) {
      return res.status(403).json({ success: false, message: 'Tu cuenta ha sido bloqueada. Contacta con el administrador.' });
    }

    // Generate JWT token
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      data: {
        token,
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
          role: user.role,
          active: user.active,
          isBlocked: user.isBlocked,
          createdAt: user.createdAt
        }
      }
    });
  } catch (error) {
    if (error.message.includes('Token used too late')) {
      return res.status(401).json({ success: false, message: 'Token expired' });
    }
    if (error.message.includes('Invalid token')) {
      return res.status(401).json({ success: false, message: 'Invalid Google token' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { register, login, getMe, googleAuth };
