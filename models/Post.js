const mongoose = require('mongoose');
const { Schema } = mongoose;

const RatingSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    value: { type: Number, min: 1, max: 5, required: true }
  }
);

const CommentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, maxlength: 1000 },
    imageUrl: { type: String, default: null },
    link: { type: String, default: null },
    editedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

const PostSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  analysisId: {
    type: Schema.Types.ObjectId,
    ref: 'Analysis',
    default: null
  },
  challengeId: {
    type: Schema.Types.ObjectId,
    ref: 'Challenge',
    default: null
  },
  // Campo legacy para documentos antiguos.
  imageUrl: {
    type: String,
    default: null
  },
  imageUrls: {
    type: [String],
    required: true,
    validate: {
      validator: (arr) => Array.isArray(arr) && arr.length >= 1 && arr.length <= 10,
      message: 'A post must have between 1 and 10 images'
    }
  },
  title: {
    type: String,
    default: '',
    trim: true,
    maxlength: 120
  },
  techniques: {
    type: [String],
    default: []
  },
  colors: {
    type: [String],
    default: []
  },
  privacy: {
    type: String,
    enum: ['public', 'followers', 'private'],
    default: 'public'
  },
  savedBy: [{
    type: Schema.Types.ObjectId,
    ref: 'User'
  }],
  faction: {
    type: String,
    default: '',
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true,
    maxlength: 1000
  },
  ratings: {
    type: [RatingSchema],
    default: []
  },
  comments: {
    type: [CommentSchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Post', PostSchema);
