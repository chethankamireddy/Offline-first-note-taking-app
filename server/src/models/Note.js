const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema(
  {
    // Client-generated UUIDv4 overrides MongoDB's default ObjectId
    _id: {
      type: String,
      required: true,
    },
    userId: {
      type: String,
      default: 'default-user',
      index: true,
    },
    title: {
      type: String,
      default: '',
    },
    content: {
      type: String,
      default: '',
    },
    createdAt: {
      type: Number,
      default: () => Date.now(),
    },
    updatedAt: {
      type: Number,
      default: () => Date.now(),
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    folderId: {
      type: String,
      default: 'notes',
      index: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    // Disable auto _id since client provides UUIDv4
    _id: false,
    timestamps: false,
  }
);

// Virtual id for JSON serialization convenience
noteSchema.virtual('id').get(function () {
  return this._id;
});

noteSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret) => {
    ret.id = ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Note', noteSchema);
