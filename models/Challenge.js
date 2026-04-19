const mongoose = require('mongoose');

const ChallengeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    description: {
      type: String,
      required: true,
      maxlength: 500
    },
    imageUrl: {
      type: String,
      default: null
    },
    startDate: {
      type: Date,
      required: true
    },
    endDate: {
      type: Date,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    winnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    winnerPostId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null
    },
    badge: {
      type: String,
      default: ''
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Challenge', ChallengeSchema);
