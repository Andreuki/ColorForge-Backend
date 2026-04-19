/**
 * Puntos que otorga cada accion en ColorForge.
 */
const SCORE_EVENTS = {
  UPLOAD_ANALYSIS: 10,
  PUBLISH_POST: 15,
  RECEIVE_COMMENT: 5,
  RECEIVE_FOLLOWER: 8,
  RECEIVE_RATING: 3,
  WIN_CHALLENGE: 100
};

/**
 * Umbrales de rango (forgeScore minimo para cada tier).
 */
const TIERS = [
  { name: 'Gran Maestro de la Forja', min: 700, icon: '👑' },
  { name: 'Maestro Herrero', min: 300, icon: '🛡️' },
  { name: 'Pintor de Batalla', min: 100, icon: '⚔️' },
  { name: 'Aprendiz de Forja', min: 0, icon: '🔨' }
];

/**
 * Calcula el tier segun el score actual.
 */
function calculateTier(score) {
  const tier = TIERS.find((t) => score >= t.min);
  return tier ? tier.name : 'Aprendiz de Forja';
}

/**
 * Anade puntos al usuario y actualiza su tier.
 * @param {string} userId - ID del usuario que recibe los puntos
 * @param {string} event - Clave del evento (de SCORE_EVENTS)
 */
async function awardPoints(userId, event) {
  const User = require('../models/User');
  const points = SCORE_EVENTS[event];
  if (!points || !userId) return;

  const user = await User.findById(userId);
  if (!user || user.isDeleted) return;

  const newScore = (user.forgeScore || 0) + points;
  const newTier = calculateTier(newScore);

  await User.findByIdAndUpdate(userId, {
    forgeScore: newScore,
    forgeTier: newTier
  });
}

module.exports = { awardPoints, calculateTier, TIERS, SCORE_EVENTS };
