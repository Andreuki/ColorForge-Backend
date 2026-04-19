const { GoogleGenerativeAI } = require('@google/generative-ai');
const sharp = require('sharp');

const DEFAULT_GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-1.5-flash-latest',
  'gemini-1.5-pro-latest'
];
const GEMINI_REQUEST_TIMEOUT_MS = 90000; // 90 segundos por modelo
const PREVIEW_MODEL_PATTERN = /(preview|experimental)/i;

function normalizeModelName(model) {
  if (typeof model !== 'string') {
    return '';
  }

  return model.trim().replace(/^models\//i, '');
}

function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
}

function getGeminiModelCandidates() {
  const allowPreviewModels = String(process.env.GEMINI_ALLOW_PREVIEW || '').toLowerCase() === 'true';
  const configured = (process.env.GEMINI_MODEL || '')
    .split(',')
    .map((value) => normalizeModelName(value))
    .filter(Boolean)
    .filter((model) => allowPreviewModels || !PREVIEW_MODEL_PATTERN.test(model));

  // Prioriza modelos configurados por entorno y luego usa estables conocidos como fallback.
  return [...new Set([...configured, ...DEFAULT_GEMINI_MODELS])];
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => {
        const error = new Error(`Timeout esperando respuesta de ${label} después de ${timeoutMs}ms`);
        error.code = 'GEMINI_TIMEOUT';
        reject(error);
      }, timeoutMs)
    )
  ]);
}

function getGeminiClient() {
  const apiKey = getGeminiApiKey();

  if (!apiKey) {
    const error = new Error('Falta GEMINI_API_KEY (o GOOGLE_API_KEY) en variables de entorno.');
    error.code = 'GEMINI_MISSING_API_KEY';
    throw error;
  }

  return new GoogleGenerativeAI(apiKey);
}

function extractJsonFromResponse(rawText) {
  if (typeof rawText !== 'string') {
    return null;
  }

  // Paso 1: Eliminar bloques de código markdown
  let cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  if (!cleaned) {
    return null;
  }

  // Paso 2: Extraer solo el primer objeto JSON válido si hay texto extra
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }

  // Paso 3: Intentar parse
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    // Fallback: buscar desde el primer { al último }
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    const maybeJson = cleaned.slice(start, end + 1);
    try {
      return JSON.parse(maybeJson);
    } catch (_) {
      return null;
    }
  }
}

function buildAiError(error) {
  if (error && typeof error === 'object' && error.code) {
    return error;
  }

  const message = error?.message || 'Error desconocido de Gemini';
  const normalized = new Error(message);

  const is429 = message.includes('429') || message.includes('Too Many Requests');
  const is503 = message.includes('503') || /service unavailable|high demand/i.test(message);
  const invalidApiKey = /api key not valid|invalid api key|permission denied/i.test(message);
  const quotaExceeded =
    message.includes('Quota exceeded') ||
    message.includes('limit: 0') ||
    message.includes('free_tier_requests') ||
    message.includes('free_tier_input_token_count');
  const modelNotFound = /model .* not found|is not supported for generatecontent|not found for api version/i.test(message);

  normalized.code =
    quotaExceeded
      ? 'GEMINI_QUOTA_EXCEEDED'
      : is429
        ? 'GEMINI_RATE_LIMIT'
        : is503
          ? 'GEMINI_TEMPORARY_UNAVAILABLE'
        : invalidApiKey
          ? 'GEMINI_AUTH_ERROR'
          : modelNotFound
            ? 'GEMINI_MODEL_NOT_FOUND'
            : 'GEMINI_REQUEST_FAILED';

  // Intenta extraer retryDelay del texto: retryDelay:"8s"
  const retryMatch = message.match(/retryDelay":"(\d+)s"/i) || message.match(/retry in\s+([\d.]+)s/i);
  if (retryMatch) {
    normalized.retryAfterSec = Math.ceil(Number(retryMatch[1]));
  }

  return normalized;
}

async function buildInventoryContext(userId) {
  if (!userId) return '';

  const User = require('../models/User');
  const user = await User.findById(userId).populate('ownedPaints.paintId');

  if (!user || !Array.isArray(user.ownedPaints) || user.ownedPaints.length === 0) {
    return '';
  }

  const paintNames = user.ownedPaints
    .filter((p) => p && p.status !== 'Empty' && p.paintId)
    .map((p) => `${p.paintId.name} (${p.paintId.brand})`)
    .join(', ');

  if (!paintNames) return '';

  return `\n\nIMPORTANT: The user has the following paints in their inventory: ${paintNames}. Prioritize recommending these paints in the step-by-step guide. If a critical color is missing, suggest how to mix existing paints to achieve it, or recommend the minimum additional purchase.`;
}

async function getPaintingAdvice(imagePath, detectedColors, recommendedScheme, userId) {
  // Redimensionar la imagen a máximo 512px antes de enviarla — reduce tokens drasticamente
  const resizedBuffer = await sharp(imagePath)
    .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();

  const base64Image = resizedBuffer.toString('base64');
  const mimeType = 'image/jpeg';

  const genAI = getGeminiClient();
  const modelCandidates = getGeminiModelCandidates();

  if (process.env.NODE_ENV !== 'production') {
    console.log('Modelos Gemini candidatos para analisis:', modelCandidates.join(', '));
  }

  const basePrompt = `Eres PaintCoach, el asistente más completo del mundo en pintura de miniaturas de wargames y juegos de rol (Warhammer 40K, Age of Sigmar, D&D, Infinity, Bolt Action, Kings of War, etc.). Combinas el conocimiento de un pintor profesional de competición con la capacidad pedagógica de un instructor que enseña desde cero.

════════════════════════════════════════
ANÁLISIS VISUAL PREVIO (hazlo internamente antes de responder)
════════════════════════════════════════
Antes de generar la respuesta, analiza en silencio:
1. ¿A qué facción, ejército o universo pertenece la miniatura? (Ultramarines, Chaos Space Marines, Stormcast Eternals, Skaven, Drow, etc.)
2. ¿Qué tipo de miniatura es? (infantería, héroe/personaje, monstruo, vehículo, caballería, mago, etc.)
3. ¿Está imprimada? Busca signos de capa de imprimación: superficie uniforme mate sin brillo plástico, color base negro/blanco/gris/marrón sin variación, ausencia de detalles pintados. Indica si detectas imprimación y de qué color aparenta ser.
4. ¿Tiene ya algún trabajo de pintura iniciado o está sin pintar?
5. ¿Qué materiales y zonas tiene? (armadura, piel, tela, metal, cuero, gemas, efectos mágicos, base del peana, etc.)
6. ¿Cuál es el esquema de color dominante?

Colores predominantes detectados automáticamente: ${detectedColors.join(', ')}.
Esquema de color clasificado: ${recommendedScheme}.

════════════════════════════════════════
INSTRUCCIONES DE RESPUESTA
════════════════════════════════════════
Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, sin bloques de código, sin comillas triples. El JSON debe seguir EXACTAMENTE esta estructura y rellenar todos los campos con contenido real, extenso y útil:

{
  "miniatureIdentification": {
    "detectedFaction": "nombre de la facción o universo detectado, o 'No identificada con certeza' si no puedes determinarlo",
    "miniatureType": "tipo de miniatura (infantería de línea, héroe, monstruo, vehículo, etc.)",
    "specificUnit": "nombre de la unidad específica si la reconoces (ej: 'Space Marine Intercessor', 'Chaos Warrior', 'Beholder'), o 'Desconocida'",
    "confidence": "Alta / Media / Baja — tu nivel de confianza en la identificación",
    "isPrimed": true,
    "primerColor": "color de imprimación detectado (Negro / Blanco / Gris / Marrón / No imprimada / No determinable)",
    "currentPaintingState": "Sin pintar / Imprimada / Parcialmente pintada / Completamente pintada"
  },

  "officialColorScheme": {
    "isOfficialFaction": true,
    "factionName": "nombre oficial de la facción si aplica",
    "canonicalSchemeDescription": "descripción del esquema de color canónico oficial de esta facción/unidad según el lore y las guías oficiales de Games Workshop u otras editoriales. Sé muy específico.",
    "deviationsFromCanon": "si la miniatura ya tiene pintura, indica si el esquema observado sigue el canon o se desvía, y en qué aspectos",
    "alternativeSchemes": ["esquema alternativo 1 (ej: Marines Espaciales del Caos de la Legión Alfa)", "esquema alternativo 2", "esquema personalizado sugerido"]
  },

  "schemeEvaluation": "Evaluación detallada del esquema de color observado: armonía, contrastes, puntos fuertes y áreas de mejora. Mínimo 3-4 frases.",

  "primerAdvice": "Consejo específico sobre imprimación según el estado detectado. Si NO está imprimada: explica por qué es IMPRESCINDIBLE imprimar antes de pintar, qué color de imprimación recomiendas para ESTA miniatura concreta y por qué (negro para realces oscuros, blanco para colores vivos, gris para equilibrio), cómo aplicarla (spray vs pincel), y qué productos específicos usar (ej: Chaos Black Spray de Citadel, Grey Seer de Citadel, Vallejo Surface Primer, Army Painter Color Primer). Si YA está imprimada: evalúa si el color de imprimación es adecuado para el esquema objetivo y da consejos para aprovecharla.",

  "stepByStepGuide": [
    {
      "stepNumber": 1,
      "title": "título corto del paso (ej: 'Preparación y limpieza')",
      "zone": "zona de la miniatura a la que aplica (ej: 'Toda la miniatura', 'Armadura', 'Piel', 'Capa', etc.)",
      "difficulty": "Principiante / Intermedio / Avanzado",
      "estimatedTime": "tiempo estimado (ej: '15-20 minutos')",
      "description": "explicación detallada y pedagógica del paso, como si le hablaras a alguien que nunca ha pintado. Explica el QUÉ, el CÓMO y el PORQUÉ. Mínimo 4-5 frases.",
      "technique": "nombre de la técnica principal usada en este paso (ej: 'Base coating', 'Dry brushing', 'Washing', 'Layering', 'Edge highlighting', 'Wet blending', 'Glazing', 'OSL', 'NMM', etc.)",
      "techniqueExplanation": "explicación breve de en qué consiste esta técnica para alguien que no la conoce",
      "citadelPaint": "nombre exacto de la pintura Citadel recomendada para esta zona en este paso (ej: 'Macragge Blue — Base')",
      "vallejoPaint": "nombre exacto de la pintura Vallejo equivalente (ej: 'Vallejo Model Color 70.899 Dark Prussian Blue')",
      "akPaint": "nombre exacto de la pintura AK Interactive equivalente si existe, o 'Sin equivalente directo'",
      "armyPainterPaint": "nombre exacto de Army Painter equivalente (ej: 'Army Painter Ultramarine Blue')",
      "colorHex": "código HEX aproximado del color resultante en este paso (ej: '#1B3A6B')",
      "imageSearchSuggestion": "frase corta para buscar imágenes o vídeos de referencia de esta técnica en YouTube o Google (ej: 'how to drybrush miniatures beginner tutorial')",
      "videoReferences": [
        {
          "title": "título descriptivo del tipo de vídeo recomendado",
          "searchQuery": "búsqueda exacta que el usuario puede introducir en YouTube para encontrar tutoriales de este paso",
          "channel": "canal de YouTube recomendado si conoces alguno especializado (ej: 'Midwinter Minis', 'Warhammer TV', 'Vince Venturella', 'Duncan Rhodes Painting Academy', 'Goobertown Hobbies')"
        }
      ],
      "commonMistakes": "error más común que cometen los principiantes en este paso y cómo evitarlo",
      "proTip": "consejo avanzado o truco profesional para mejorar el resultado de este paso"
    }
  ],

  "advancedTechniques": [
    {
      "name": "nombre de la técnica avanzada",
      "applicableZone": "zona donde aplicarla en esta miniatura",
      "description": "descripción detallada de la técnica y su efecto visual",
      "difficulty": "Intermedio / Avanzado / Experto",
      "videoSearchQuery": "búsqueda de YouTube recomendada para aprender esta técnica"
    }
  ],

  "paintingTips": [
    "tip 1 — consejo práctico específico para esta miniatura o facción",
    "tip 2 — consejo sobre consistencia de la pintura (dilución con agua o medium)",
    "tip 3 — consejo sobre iluminación y zona de trabajo",
    "tip 4 — consejo sobre orden de pintado (siempre de oscuro a claro, del interior al exterior)",
    "tip 5 — consejo sobre secado entre capas",
    "tip 6 — tip específico de la facción o tipo de miniatura detectada",
    "tip 7 — consejo sobre cómo proteger la miniatura terminada (barniz mate/satinado/brillante)"
  ],

  "materialsAndTools": {
    "primersNeeded": [
      {
        "product": "nombre del producto",
        "brand": "marca",
        "color": "color",
        "purpose": "para qué sirve en esta miniatura"
      }
    ],
    "paintList": [
      {
        "zone": "zona de la miniatura",
        "paintingStage": "Base / Sombra / Iluminación / Detalle",
        "citadel": "nombre Citadel",
        "vallejo": "nombre Vallejo",
        "ak": "nombre AK Interactive o 'N/A'",
        "armyPainter": "nombre Army Painter o 'N/A'",
        "hex": "#RRGGBB"
      }
    ],
    "brushesNeeded": [
      {
        "size": "tamaño del pincel (ej: '000', '0', '1', '2', 'grande plano')",
        "type": "tipo (redondo de punta fina, plano, abanico, etc.)",
        "purpose": "para qué se usa en esta miniatura",
        "recommendedBrand": "marca recomendada (ej: 'Winsor & Newton Series 7', 'Raphael 8404', 'Army Painter Kolinsky')"
      }
    ],
    "additionalMaterials": [
      {
        "material": "nombre del material adicional (agua destilada, medium retardante, gel de textura, arena fina, tufts, etc.)",
        "purpose": "para qué se usa",
        "recommendedProduct": "producto específico si aplica"
      }
    ],
    "estimatedTotalCost": "estimación del coste total aproximado de los materiales en euros para pintar esta miniatura desde cero",
    "estimatedTotalTime": "estimación del tiempo total para completar la miniatura de principio a fin, incluyendo secados"
  },

  "techniques": ["lista resumida de las técnicas principales mencionadas en la guía, en orden de dificultad"],
  "schemeEvaluationSummary": "resumen de una línea del esquema de color",
  "materialTips": "resumen de los materiales más importantes en una frase"
}

REGLAS ABSOLUTAS:
- Responde SIEMPRE en español.
- Devuelve ÚNICAMENTE el JSON. Ni una sola palabra fuera del objeto JSON.
- El JSON debe ser válido y parseable. No uses caracteres especiales sin escapar.
- El array stepByStepGuide debe tener MÍNIMO 8 pasos y MÁXIMO 12, cubriendo todo el proceso desde el estado actual de la miniatura hasta el acabado final.
- Si identificas la miniatura como perteneciente a una facción conocida (Warhammer 40K, AoS, D&D, etc.), los colores de pintura deben seguir el esquema canónico oficial de esa facción y unidad específica.
- Todos los nombres de pinturas deben ser nombres REALES y EXACTOS de productos existentes en el mercado.
- Los videoReferences deben ser búsquedas reales y útiles que el usuario pueda introducir directamente en YouTube.
- Si la miniatura NO está imprimada, el paso 1 OBLIGATORIAMENTE debe ser la imprimación.`;

  const inventoryContext = await buildInventoryContext(userId);
  const prompt = basePrompt + inventoryContext;

  let lastError = null;
  const failedModels = [];

  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3
        }
      });

      const result = await withTimeout(
        model.generateContent([
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt }
        ]),
        GEMINI_REQUEST_TIMEOUT_MS,
        `modelo ${modelName}`
      );

      const text = result?.response?.text?.() || '';
      const parsed = extractJsonFromResponse(text);

      if (!parsed) {
        const parseError = new Error('Gemini devolvio una respuesta que no es JSON parseable.');
        parseError.code = 'GEMINI_INVALID_JSON';
        throw parseError;
      }

      if (process.env.NODE_ENV !== 'production') {
        parsed.__rawResponse = text;
        parsed.__modelName = modelName;
        console.log('Analisis generado con modelo Gemini:', modelName);
      }

      return parsed;
    } catch (error) {
      const normalized = buildAiError(error);
      lastError = normalized;
      failedModels.push({ modelo: modelName, codigo: normalized.code, mensaje: normalized.message });

      if (normalized.code === 'GEMINI_TEMPORARY_UNAVAILABLE') {
        const waitTime = normalized.retryAfterSec ? normalized.retryAfterSec * 1000 : 1200;
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`Modelo ${modelName} temporalmente no disponible, esperando ${waitTime}ms...`);
        }
        await wait(waitTime);
      }

      if (process.env.NODE_ENV !== 'production') {
        console.warn('Fallo Gemini con modelo', modelName, 'codigo', normalized.code, 'mensaje', normalized.message);
      }

      if (
        normalized.code === 'GEMINI_AUTH_ERROR' ||
        normalized.code === 'GEMINI_MISSING_API_KEY'
      ) {
        throw normalized;
      }

      // En quota/rate/model_not_found/request_failed/timeout intentamos el siguiente modelo.
      continue;
    }
  }

  // Si llegamos aquí, todos los modelos fallaron
  const errorMsg = `Todos los modelos de Gemini fallaron. Intentados: ${failedModels.map(m => m.modelo).join(', ')}. Último error: ${lastError?.message || 'desconocido'}`;
  const finalError = new Error(errorMsg);
  finalError.code = 'GEMINI_ALL_MODELS_FAILED';
  finalError.failedAttempts = failedModels;
  throw finalError;
}

module.exports = { getPaintingAdvice };