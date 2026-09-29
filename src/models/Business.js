const mongoose = require('mongoose');

const photoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    // Storage path/key, needed to delete the file later
    path: { type: String, required: true },
    provider: { type: String, enum: ['firebase', 'local'], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const businessSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 2000 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true, index: true },
    tags: [{ type: String, trim: true, lowercase: true }],
    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true, required: true },
      state: { type: String, trim: true },
      zip: { type: String, trim: true },
      country: { type: String, trim: true, default: 'India' },
    },
    // GeoJSON point, coordinates are [longitude, latitude]
    location: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: {
        type: [Number],
        validate: {
          validator: (v) => !v || v.length === 0 || (v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90),
          message: 'coordinates must be [longitude, latitude]',
        },
      },
    },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    website: { type: String, trim: true },
    photos: [photoSchema],
    averageRating: { type: Number, default: 0, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

businessSchema.index({ location: '2dsphere' });
businessSchema.index({ 'address.city': 1 });
businessSchema.index({ averageRating: -1 });

// A Point with no coordinates breaks the 2dsphere index, so drop it entirely.
businessSchema.pre('validate', function cleanLocation() {
  if (this.location && (!this.location.coordinates || this.location.coordinates.length === 0)) {
    this.location = undefined;
  }
});

businessSchema.set('toJSON', { versionKey: false });

module.exports = mongoose.model('Business', businessSchema);
