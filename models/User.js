const mongoose = require('mongoose');
const { hashPassword } = require('../utils/crypto');

const UserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'El nombre de usuario es obligatorio'],
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: [true, 'El email es obligatorio'],
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: [true, 'La contraseña es obligatoria'],
    select: false // Nunca se devuelve en las queries por defecto
  },
  avatar: {
    type: String,
    default: null,
    trim: true
  },
  bio: {
    type: String,
    default: '',
    trim: true,
    maxlength: 500
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  active: {
    type: Boolean,
    default: true
  },
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  ownedPaints: [{
    paintId: { type: mongoose.Schema.Types.ObjectId, ref: 'Paint' },
    status: {
      type: String,
      enum: ['Full', 'Low', 'Empty'],
      default: 'Full'
    }
  }],
  isBlocked: {
    type: Boolean,
    default: false
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  forgeScore: {
    type: Number,
    default: 0,
    min: 0
  },
  forgeTier: {
    type: String,
    enum: ['Aprendiz de Forja', 'Pintor de Batalla', 'Maestro Herrero', 'Gran Maestro de la Forja'],
    default: 'Aprendiz de Forja'
  },
  badges: {
    type: [String],
    default: []
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Optimiza el ranking de usuarios ordenado por forgeScore.
UserSchema.index({ forgeScore: -1 });

// Optimiza filtros de usuarios activos/no eliminados en listados y paneles admin.
UserSchema.index({ isDeleted: 1, active: 1 });

// Hashear contraseña antes de guardar, solo si fue modificada
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await hashPassword(this.password);
  next();
});

module.exports = mongoose.model('User', UserSchema);
