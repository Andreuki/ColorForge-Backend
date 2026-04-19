const mongoose = require('mongoose');

const PaintSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    brand: {
      type: String,
      required: true,
      enum: ['Citadel', 'Vallejo', 'Army Painter', 'AK Interactive', 'Scale75', 'Otra']
    },
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
  { timestamps: false }
);

module.exports = mongoose.model('Paint', PaintSchema);
