const mongoose = require('mongoose');
const { Schema } = mongoose;

const AnalysisSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    default: '',
    trim: true,
    maxlength: [80, 'Title cannot exceed 80 characters']
  },
  imageUrl: {
    type: String,
    required: true
  },
  detectedColors: [{ type: String }],         // Array de HEX ej: ["#FF5733", "#C70039"]
  recommendedScheme: { type: String },        // ej: "Complementario", "Triádico"
  recommendedTechniques: [{ type: String }],  // ej: ["Dry brushing", "Glazing"]
  schemeEvaluation: { type: String },         // Evaluación textual del esquema (generada por IA)
  materialTips:     { type: String },         // Consejos de materiales opcionales (generados por IA)
  miniatureIdentification: {
    type: Schema.Types.Mixed,
    default: null
  },
  officialColorScheme: {
    type: Schema.Types.Mixed,
    default: null
  },
  primerAdvice: {
    type: String,
    default: null
  },
  stepByStepGuide: {
    type: [Schema.Types.Mixed],
    default: []
  },
  advancedTechniques: {
    type: [Schema.Types.Mixed],
    default: []
  },
  paintingTips: {
    type: [String],
    default: []
  },
  materialsAndTools: {
    type: Schema.Types.Mixed,
    default: null
  },
  schemeEvaluationSummary: {
    type: String,
    default: null
  },
  aiWarnings: {
    type: [String],
    default: []
  },
  rawAiResponse: {
    type: String,
    default: null
  },
  rawAiModel: {
    type: String,
    default: null
  },
  aiError: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Optimiza la lista de análisis de un usuario ordenada por fecha.
AnalysisSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Analysis', AnalysisSchema);
