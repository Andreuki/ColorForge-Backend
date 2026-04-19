function normalizeWhitespace(value) {
  return value.replace(/\s+/g, ' ').trim();
}

function deepTrim(value) {
  if (typeof value === 'string') {
    return normalizeWhitespace(value);
  }

  if (Array.isArray(value)) {
    return value.map(deepTrim);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [key, deepTrim(nestedValue)])
    );
  }

  return value;
}

function normalizeTechniqueName(technique) {
  if (typeof technique !== 'string') {
    return '';
  }

  const cleaned = normalizeWhitespace(technique);
  const lower = cleaned.toLowerCase();

  if (/limpieza de moldes|clean.*mold|mold lines|lineas de molde|líneas de molde/.test(lower)) {
    return 'Limpieza de líneas de molde';
  }

  if (/^priming$|^primer$|imprimaci/.test(lower)) {
    return 'Imprimación';
  }

  if (/base coating.*metal|metallic paint|deep base coating/.test(lower)) {
    return 'Capa base metálica';
  }

  if (/base coating|basecoat|capa base/.test(lower)) {
    return 'Capa base';
  }

  if (/washing|wash|shade|shading|lavado/.test(lower)) {
    return 'Lavado';
  }

  if (/dry ?brush|drybrushing|drybrush|pincel seco/.test(lower)) {
    return 'Pincel seco';
  }

  if (/edge highlight|highlighting|iluminacion de aristas|iluminación de aristas/.test(lower)) {
    return 'Iluminación de aristas';
  }

  if (/layering|layer|capas/.test(lower)) {
    return 'Capas';
  }

  if (/glazing|glaze|veladura/.test(lower)) {
    return 'Veladuras';
  }

  if (/stippling|stipple|punteado/.test(lower)) {
    return 'Punteado';
  }

  if (/basing|base del terreno|peana/.test(lower)) {
    return 'Peana';
  }

  if (/varnishing|varnish|barniz|barnizado/.test(lower)) {
    return 'Barnizado';
  }

  if (/black lining|panel lining|perfilado de recesos/.test(lower)) {
    return 'Perfilado de recesos';
  }

  if (/detailing|detail highlight|detalles/.test(lower)) {
    return 'Detalles';
  }

  if (/nmm|non[- ]metallic metal/.test(lower)) {
    return 'NMM';
  }

  if (/osl|object source lighting/.test(lower)) {
    return 'OSL';
  }

  return cleaned;
}

function sanitizeTechniques(techniques) {
  if (!Array.isArray(techniques)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const technique of techniques) {
    const canonical = normalizeTechniqueName(technique);
    if (!canonical) {
      continue;
    }

    const dedupeKey = canonical.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    normalized.push(canonical);
  }

  return normalized;
}

function sanitizeGuide(stepByStepGuide) {
  if (!Array.isArray(stepByStepGuide)) {
    return [];
  }

  return stepByStepGuide
    .filter((step) => step && typeof step === 'object')
    .map((step, index) => {
      const cleaned = deepTrim(step);
      return {
        ...cleaned,
        stepNumber: index + 1,
        technique: normalizeTechniqueName(cleaned.technique)
      };
    });
}

function sanitizeAdvancedTechniques(advancedTechniques) {
  if (!Array.isArray(advancedTechniques)) {
    return [];
  }

  return advancedTechniques
    .filter((technique) => technique && typeof technique === 'object')
    .map((technique) => deepTrim(technique));
}

function sanitizePaintingTips(paintingTips) {
  if (!Array.isArray(paintingTips)) {
    return [];
  }

  const seen = new Set();
  const sanitized = [];

  for (const tip of paintingTips) {
    if (typeof tip !== 'string') {
      continue;
    }

    const cleaned = normalizeWhitespace(tip);
    const dedupeKey = cleaned.toLowerCase();

    if (!cleaned || seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    sanitized.push(cleaned);
  }

  return sanitized;
}

function sanitizeObject(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return deepTrim(value);
}

function buildAiWarnings({
  recommendedScheme,
  originalTechniques,
  normalizedTechniques,
  stepByStepGuide,
  schemeEvaluation,
  officialColorScheme,
  rawAiResponse
}) {
  const warnings = [];

  if (Array.isArray(originalTechniques) && originalTechniques.length !== normalizedTechniques.length) {
    warnings.push('Se normalizaron y deduplicaron nombres de técnicas generadas por la IA.');
  }

  if (stepByStepGuide.length > 0 && stepByStepGuide.length < 8) {
    warnings.push('La guía paso a paso devuelta por la IA es más corta de lo esperado.');
  }

  if (!schemeEvaluation) {
    warnings.push('La IA no devolvió una evaluación de esquema suficientemente detallada y se aplicó fallback local.');
  }

  if (recommendedScheme === 'Monocromático') {
    const colorCuePattern = /\b(rojo|azul|verde|naranja|morado|violeta|dorado|oro|turquesa|amarillo|pelirrojo|carmes[ií]|p[úu]rpura)\b/i;
    const guideText = stepByStepGuide
      .map((step) => `${step.title || ''} ${step.description || ''}`)
      .join(' ');
    const officialText = officialColorScheme
      ? Object.values(officialColorScheme).flat().join(' ')
      : '';

    if (colorCuePattern.test(`${guideText} ${officialText}`)) {
      warnings.push('El esquema detectado en la imagen es monocromático, pero la guía propone colores de acabado adicionales; interprétalo como propuesta de pintado, no como descripción del estado actual.');
    }
  }

  if (typeof rawAiResponse === 'string' && rawAiResponse.length > 20000) {
    warnings.push('La respuesta cruda de Gemini es muy extensa; conviene revisar consumo de tokens si notas latencia alta.');
  }

  return warnings;
}

module.exports = {
  buildAiWarnings,
  sanitizeAdvancedTechniques,
  sanitizeGuide,
  sanitizeObject,
  sanitizePaintingTips,
  sanitizeTechniques
};