const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    type: {
      type: String,
      enum: ['comment', 'follow', 'rating'],
      required: true
    },
    postId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Post',
      default: null
    },
    read: {
      type: Boolean,
      default: false
    },
    message: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', NotificationSchema);
