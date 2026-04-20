const { getPaletteFromURL } = require('color-thief-node');
const fs = require('fs');
const path = require('path');
const Analysis = require('../models/Analysis');
const { rgbToHex, rgbToHue, classifyScheme, getTechniquesForScheme } = require('../utils/colorAnalysis');
const { getPaintingAdvice } = require('../utils/aiPaintingAdvisor');
const { verifyFileMagicBytes } = require('../middleware/upload');
const {
  buildAiWarnings,
  sanitizeAdvancedTechniques,
  sanitizeGuide,
  sanitizeObject,
  sanitizePaintingTips,
  sanitizeTechniques
} = require('../utils/analysisAiPostProcessor');
const { awardPoints } = require('../utils/forgeScore');

// ─── POST /api/analysis  (protected) ─────────────────────────────────────────
/**
 * Pipeline completo:
 *  1. Recibe imagen via multer (ya guardada en ./uploads/)
 *  2. Extrae paleta de 8 colores dominantes con color-thief-node
 *  3. Clasifica esquema de color (lógica local)
 *  4. Consulta a Gemini Vision para técnicas, evaluación y consejos de materiales
 *  5. Persiste y devuelve el análisis (con fallback si la IA falla)
 */
const createAnalysis = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se ha subido ninguna imagen' });
    }

    const allowedImageMimes = ['image/jpeg', 'image/png', 'image/webp'];
    await verifyFileMagicBytes(req.file.path, allowedImageMimes);

    // URL pública de la imagen servida como estático
    const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

    // Extraer 8 colores dominantes → array de [r, g, b]
    // getPaletteFromURL acepta tanto URLs remotas como rutas locales de fichero
    const palette = await getPaletteFromURL(req.file.path, 8);

    // Convertir a HEX
    const detectedColors = palette.map(rgbToHex);

    // Obtener matices para clasificar el esquema
    const hues = palette.map(([r, g, b]) => rgbToHue(r, g, b));

    const recommendedScheme = classifyScheme(hues);

    // ── Consulta a Gemini Vision ─────────────────────────────────────────────
    // Fallback controlado: si la IA falla, el análisis se guarda igualmente
    let aiAdvice = {
      techniques: [],
      schemeEvaluation: '',
      materialTips: '',
      miniatureIdentification: null,
      officialColorScheme: null,
      primerAdvice: '',
      stepByStepGuide: [],
      advancedTechniques: [],
      paintingTips: [],
      materialsAndTools: null,
      schemeEvaluationSummary: ''
    };
    let aiError = false;
    let aiErrorCode = null;
    let aiRetryAfterSec = null;
    try {
      aiAdvice = await getPaintingAdvice(req.file.path, detectedColors, recommendedScheme, req.user?._id);
      if (process.env.NODE_ENV !== 'production') {
        console.log('=== AI ADVICE techniques ===', aiAdvice.techniques);
        console.log('=== KEYS recibidas ===', Object.keys(aiAdvice));
      }
    } catch (aiErr) {
      console.error('Error al consultar la IA:', aiErr.message);
      aiError = true;
      aiErrorCode = aiErr.code || 'AI_REQUEST_FAILED';
      aiRetryAfterSec = aiErr.retryAfterSec || null;
    }

    const techniquesFromAi = [
      // Fuente 1: techniques directas de la IA
      ...(Array.isArray(aiAdvice?.techniques) ? aiAdvice.techniques : []),
      // Fuente 2: recommendedTechniques si vienen como campo separado
      ...(Array.isArray(aiAdvice?.recommendedTechniques) ? aiAdvice.recommendedTechniques : []),
      // Fuente 3: técnicas extraídas del guía paso a paso
      ...(Array.isArray(aiAdvice?.stepByStepGuide)
        ? aiAdvice.stepByStepGuide.map((step) => step?.technique).filter(Boolean)
        : []),
      // Fuente 4: nombres de técnicas avanzadas SOLO si techniques no existe
      ...(!Array.isArray(aiAdvice?.techniques) && Array.isArray(aiAdvice?.advancedTechniques)
        ? aiAdvice.advancedTechniques.map((t) => t?.name).filter(Boolean)
        : [])
    ];

    const recommendedTechniques = sanitizeTechniques(techniquesFromAi);

    const stepByStepGuide = sanitizeGuide(aiAdvice?.stepByStepGuide);

    const advancedTechniques = sanitizeAdvancedTechniques(aiAdvice?.advancedTechniques);

    const paintingTips = sanitizePaintingTips(aiAdvice?.paintingTips);

    const schemeEvaluationFromAi =
      (typeof aiAdvice?.schemeEvaluation === 'string' && aiAdvice.schemeEvaluation.trim()) || '';

    const schemeEvaluation =
      schemeEvaluationFromAi ||
      (typeof aiAdvice?.schemeEvaluationSummary === 'string' && aiAdvice.schemeEvaluationSummary.trim()) ||
      `La miniatura presenta una base cromatica ${recommendedScheme.toLowerCase()} apoyada por los tonos ${detectedColors
        .slice(0, 3)
        .join(', ')}. Conviene reforzar sombras, separar materiales y reservar los mayores contrastes para el punto focal.`;

    const materialTips =
      (typeof aiAdvice?.materialTips === 'string' && aiAdvice.materialTips.trim()) ||
      (paintingTips.length
        ? paintingTips
            .slice(0, 3)
            .join(' ')
        : '') ||
      `Para un esquema ${recommendedScheme.toLowerCase()}, aplica capas finas con pintura acrilica, usa ${detectedColors
        .slice(0, 3)
        .join(', ')} como guia cromatica, refuerza volumen con lavados y luces, y protege la miniatura con barniz mate al finalizar.`;

    const primerAdvice =
      (typeof aiAdvice?.primerAdvice === 'string' && aiAdvice.primerAdvice.trim()) ||
      null;

    const schemeEvaluationSummary =
      (typeof aiAdvice?.schemeEvaluationSummary === 'string' && aiAdvice.schemeEvaluationSummary.trim()) ||
      null;

    const miniatureIdentification = sanitizeObject(aiAdvice?.miniatureIdentification);
    const officialColorScheme = sanitizeObject(aiAdvice?.officialColorScheme);
    const materialsAndTools = sanitizeObject(aiAdvice?.materialsAndTools);

    const aiWarnings = buildAiWarnings({
      recommendedScheme,
      originalTechniques: techniquesFromAi,
      normalizedTechniques: recommendedTechniques,
      stepByStepGuide,
      schemeEvaluation: schemeEvaluationFromAi,
      officialColorScheme,
      rawAiResponse: aiAdvice?.__rawResponse
    });

    const rawAiResponse =
      process.env.NODE_ENV !== 'production' && typeof aiAdvice?.__rawResponse === 'string'
        ? aiAdvice.__rawResponse.slice(0, 25000)
        : null;

    const rawAiModel =
      process.env.NODE_ENV !== 'production' && typeof aiAdvice?.__modelName === 'string'
        ? aiAdvice.__modelName
        : null;

    const analysis = await Analysis.create({
      userId: req.user._id,
      imageUrl,
      detectedColors,
      recommendedScheme,
      recommendedTechniques: recommendedTechniques.length
        ? recommendedTechniques
        : getTechniquesForScheme(recommendedScheme),
      schemeEvaluation,
      materialTips,
      miniatureIdentification,
      officialColorScheme,
      primerAdvice,
      stepByStepGuide,
      advancedTechniques,
      paintingTips,
      materialsAndTools,
      schemeEvaluationSummary,
      aiWarnings,
      rawAiResponse,
      rawAiModel,
      aiError
    });

    await awardPoints(req.user._id, 'UPLOAD_ANALYSIS');

    res.status(201).json({
      success: true,
      data: analysis,
      ...(aiError && {
        aiError: true,
        aiErrorCode,
        ...(aiRetryAfterSec ? { aiRetryAfterSec } : {})
      })
    });
  } catch (error) {
    if (error.status === 400) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

// ─── GET /api/analysis  (protected) ──────────────────────────────────────────
const getUserAnalyses = async (req, res, next) => {
  try {
    const analyses = await Analysis.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.status(200).json({ success: true, data: analyses });
  } catch (error) {
    next(error);
  }
};

// ─── GET /api/analysis/:id  (protected) ──────────────────────────────────────
const getAnalysisById = async (req, res, next) => {
  try {
    const analysis = await Analysis.findById(req.params.id);

    if (!analysis) {
      return res.status(404).json({ success: false, message: 'Análisis no encontrado' });
    }

    // Solo el propietario puede ver su análisis
    if (analysis.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'No tienes permiso para ver este análisis' });
    }

    res.status(200).json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
};

const updateAnalysisTitle = async (req, res) => {
  try {
    const { title } = req.body;

    if (typeof title !== 'string' || title.trim().length < 3 || title.trim().length > 80) {
      return res.status(400).json({ error: 'Title must be between 3 and 80 characters' });
    }

    req.resource.title = title.trim();
    await req.resource.save();

    res.status(200).json(req.resource);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAnalysis = async (req, res) => {
  try {
    const analysis = req.resource;

    if (typeof analysis.imageUrl === 'string' && analysis.imageUrl.includes('/uploads/')) {
      let pathname = analysis.imageUrl;

      if (analysis.imageUrl.startsWith('http://') || analysis.imageUrl.startsWith('https://')) {
        pathname = new URL(analysis.imageUrl).pathname;
      }

      const uploadPath = pathname.split('?')[0];
      const relative = uploadPath.startsWith('/') ? uploadPath.slice(1) : uploadPath;
      const localPath = path.join(__dirname, '..', relative);

      if (fs.existsSync(localPath)) {
        fs.unlinkSync(localPath);
      }
    }

    await Analysis.findByIdAndDelete(req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  createAnalysis,
  getUserAnalyses,
  getAnalysisById,
  updateAnalysisTitle,
  deleteAnalysis
};
