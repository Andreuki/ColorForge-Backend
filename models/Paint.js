const mongoose = require('mongoose');

const PaintSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    brand: {
      type: String,
      required: true,
      trim: true
    },
    hexColor: { type: String, required: true, match: /^#[0-9A-Fa-f]{6}$/ },
    line: { type: String, default: '', trim: true },
    isCustom: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    type: {
      type: String,
      enum: ['Base', 'Layer', 'Shade', 'Dry', 'Technical', 'Contrast', 'Air', 'Texture', 'Otro'],
      default: 'Base'
    },
    colorFamily: {
      type: String,
      enum: [
        'Rojo',
        'Azul',
        'Verde',
        'Amarillo',
        'Naranja',
        'Púrpura',
        'Marrón',
        'Blanco',
        'Negro',
        'Gris',
        'Metálico',
        'Turquesa',
        'Hueso',
        'Otro'
      ],
      default: 'Otro'
    },
    hex: { type: String, default: '#888888' }
  },
  { timestamps: true }
);

PaintSchema.index({ userId: 1 });

module.exports = mongoose.model('Paint', PaintSchema);
