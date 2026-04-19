/**
 * Ejecutar una sola vez para poblar el catalogo de pinturas:
 * node scripts/seedPaints.js
 */
const mongoose = require('mongoose');
const Paint = require('../models/Paint');
require('dotenv').config();

const paints = [
  { name: 'Abaddon Black', brand: 'Citadel', type: 'Base', colorFamily: 'Negro', hex: '#0D0D0D' },
  { name: 'Mephiston Red', brand: 'Citadel', type: 'Base', colorFamily: 'Rojo', hex: '#9E1014' },
  { name: 'Macragge Blue', brand: 'Citadel', type: 'Base', colorFamily: 'Azul', hex: '#15478A' },
  { name: 'Leadbelcher', brand: 'Citadel', type: 'Base', colorFamily: 'Metálico', hex: '#7B8B92' },
  { name: 'Zandri Dust', brand: 'Citadel', type: 'Base', colorFamily: 'Hueso', hex: '#A89165' },
  { name: 'Khorne Red', brand: 'Citadel', type: 'Base', colorFamily: 'Rojo', hex: '#6B0F14' },
  { name: 'Retributor Armour', brand: 'Citadel', type: 'Base', colorFamily: 'Metálico', hex: '#B8912A' },
  { name: 'Celestra Grey', brand: 'Citadel', type: 'Base', colorFamily: 'Gris', hex: '#A0A89C' },
  { name: 'Corax White', brand: 'Citadel', type: 'Base', colorFamily: 'Blanco', hex: '#F0EFE8' },
  { name: 'Wraithbone', brand: 'Citadel', type: 'Base', colorFamily: 'Hueso', hex: '#D8C9A3' },
  { name: 'Agrax Earthshade', brand: 'Citadel', type: 'Shade', colorFamily: 'Marrón', hex: '#3D2B1A' },
  { name: 'Nuln Oil', brand: 'Citadel', type: 'Shade', colorFamily: 'Negro', hex: '#1A1A1A' },
  { name: 'Reikland Fleshshade', brand: 'Citadel', type: 'Shade', colorFamily: 'Naranja', hex: '#6B3A25' },
  { name: 'Druchii Violet', brand: 'Citadel', type: 'Shade', colorFamily: 'Púrpura', hex: '#4B2060' },
  { name: 'Coelia Greenshade', brand: 'Citadel', type: 'Shade', colorFamily: 'Verde', hex: '#204530' },
  { name: 'Evil Sunz Scarlet', brand: 'Citadel', type: 'Layer', colorFamily: 'Rojo', hex: '#C41E2A' },
  { name: 'Ironbreaker', brand: 'Citadel', type: 'Layer', colorFamily: 'Metálico', hex: '#B0B8BE' },
  { name: 'Ushabti Bone', brand: 'Citadel', type: 'Layer', colorFamily: 'Hueso', hex: '#C8B87A' },
  { name: 'Gunmetal Grey', brand: 'Vallejo', type: 'Base', colorFamily: 'Metálico', hex: '#6B6E72' },
  { name: 'Black Red', brand: 'Vallejo', type: 'Base', colorFamily: 'Rojo', hex: '#5C1010' },
  { name: 'Ivory', brand: 'Vallejo', type: 'Base', colorFamily: 'Blanco', hex: '#EEEAD4' },
  { name: 'German Grey', brand: 'Vallejo', type: 'Base', colorFamily: 'Gris', hex: '#4A4A4A' },
  { name: 'Dragon Red', brand: 'Army Painter', type: 'Base', colorFamily: 'Rojo', hex: '#B01820' },
  { name: 'Rough Iron', brand: 'Army Painter', type: 'Base', colorFamily: 'Metálico', hex: '#7A7E82' },
  { name: 'Strong Tone', brand: 'Army Painter', type: 'Shade', colorFamily: 'Marrón', hex: '#3A2415' },
  { name: 'Skeleton Bone', brand: 'Army Painter', type: 'Base', colorFamily: 'Hueso', hex: '#C8BA90' }
];

const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

if (!mongoUri) {
  console.error('Missing MONGODB_URI or MONGO_URI in .env');
  process.exit(1);
}

mongoose.connect(mongoUri).then(async () => {
  await Paint.deleteMany({});
  await Paint.insertMany(paints);
  console.log(`OK ${paints.length} paints seeded successfully`);
  mongoose.disconnect();
}).catch((err) => {
  console.error('Seed error:', err.message);
  process.exit(1);
});
