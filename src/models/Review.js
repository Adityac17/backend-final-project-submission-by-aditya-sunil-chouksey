const mongoose = require('mongoose');
const { roundRatingStats } = require('../utils/query');

const reviewSchema = new mongoose.Schema(
  {
    business: { type: mongoose.Schema.Types.ObjectId, ref: 'Business', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, trim: true, maxlength: 120 },
    comment: { type: String, trim: true, maxlength: 2000 },
    ownerResponse: {
      text: { type: String, trim: true, maxlength: 1000 },
      respondedAt: Date,
    },
  },
  { timestamps: true }
);

// One review per user per business
reviewSchema.index({ business: 1, user: 1 }, { unique: true });

// Recompute the cached rating on the business from its reviews.
reviewSchema.statics.syncBusinessRating = async function syncBusinessRating(businessId) {
  const [agg] = await this.aggregate([
    { $match: { business: new mongoose.Types.ObjectId(String(businessId)) } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const stats = roundRatingStats(agg);
  await mongoose.model('Business').findByIdAndUpdate(businessId, stats);
  return stats;
};

reviewSchema.set('toJSON', { versionKey: false });

module.exports = mongoose.model('Review', reviewSchema);
