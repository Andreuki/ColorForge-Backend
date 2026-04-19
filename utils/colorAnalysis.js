/**
 * Utilidades para análisis de esquemas de color y recomendaciones de técnicas.
 * Usadas por analysisController tras extraer la paleta de una imagen.
 */

/**
 * Convierte un array RGB [r, g, b] a cadena HEX "#RRGGBB".
 * @param {number[]} rgb
 * @returns {string}
 */
function rgbToHex([r, g, b]) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(v).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/**
 * Extrae el valor Hue (0–360) de un color RGB.
 * Colores acromáticos (negro, blanco, gris) devuelven hue = -1 para excluirlos.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {number}
 */
function rgbToHue(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  // Saturación muy baja → color acromático, sin matiz útil
  if (delta < 0.1) return -1;

  let hue;
  if (max === rn)      hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else                 hue = (rn - gn) / delta + 4;

  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  return hue;
}

/**
 * Calcula la diferencia angular entre dos matices (resultado entre 0 y 180).
 * @param {number} h1
 * @param {number} h2
 * @returns {number}
 */
function hueDifference(h1, h2) {
  const diff = Math.abs(h1 - h2) % 360;
  return diff > 180 ? 360 - diff : diff;
}

/**
 * Clasifica el esquema de color a partir de un array de matices.
 * Filtra valores acromáticos (-1) antes de analizar.
 *
 * Reglas:
 *  - Monocromático : rango de matices < 30°
 *  - Análogo       : rango de matices entre 30° y 60°
 *  - Complementario: dos clusters de matices separados ~180°
 *  - Triádico      : rango amplio con al menos 3 colores distintos (≥ 200°)
 *  - Tetràdico     : rango muy amplio con ≥ 4 colores distintos (≥ 270°)
 *
 * @param {number[]} hues - Array de valores Hue (incluye posibles -1)
 * @returns {string}
 */
function classifyScheme(hues) {
  // Descartar acromáticos
  const chromatic = hues.filter((h) => h >= 0);

  if (chromatic.length === 0) return 'Monocromático';

  const sorted = [...chromatic].sort((a, b) => a - b);
  const hueRange = sorted[sorted.length - 1] - sorted[0];

  if (hueRange < 30) return 'Monocromático';
  if (hueRange <= 60) return 'Análogo';

  // Buscar si existe un "salto" grande que divida los colores en dos clusters opuestos
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1] - sorted[i];
    if (gap > 100) {
      const cluster1 = sorted.slice(0, i + 1);
      const cluster2 = sorted.slice(i + 1);
      const avg1 = cluster1.reduce((a, b) => a + b, 0) / cluster1.length;
      const avg2 = cluster2.reduce((a, b) => a + b, 0) / cluster2.length;
      const diff = hueDifference(avg1, avg2);
      if (diff >= 140 && diff <= 220) return 'Complementario';
    }
  }

  if (chromatic.length >= 4 && hueRange >= 270) return 'Tetràdico';
  if (chromatic.length >= 3 && hueRange >= 200) return 'Triádico';

  return 'Análogo';
}

/**
 * Devuelve técnicas de pintura recomendadas según el esquema de color detectado.
 * @param {string} scheme
 * @returns {string[]}
 */
function getTechniquesForScheme(scheme) {
  const techniqueMap = {
    'Monocromático': ['Wet blending', 'Glazing', 'Shading with washes'],
    'Análogo':       ['Layering', 'Blending', 'Wet blending'],
    'Complementario':['Contrast painting', 'Highlighting', 'OSL (Object Source Lighting)'],
    'Triádico':      ['Dry brushing', 'Stippling', 'Glazing'],
    'Tetràdico':     ['Freehanding', 'Non-metallic metal (NMM)', 'Color modulation']
  };
  return techniqueMap[scheme] || ['Layering', 'Washing', 'Highlighting'];
}

module.exports = { rgbToHex, rgbToHue, classifyScheme, getTechniquesForScheme };
