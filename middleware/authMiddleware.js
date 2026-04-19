const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Middleware de protección JWT.
 * Extrae, verifica el token del header Authorization y adjunta el usuario a req.user.
 */
const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado, token no proporcionado'
      });
    }

    const token = authHeader.split(' ')[1];

    // Verificar firma y expiración del token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Buscar usuario en BD (sin el campo password)
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No autorizado, usuario no encontrado'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'No autorizado, token inválido o expirado'
    });
  }
};

module.exports = { protect };
