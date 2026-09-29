const mongoose = require('mongoose');
const { slugify } = require('../utils/query');

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true, maxlength: 50 },
    slug: { type: String, unique: true, lowercase: true },
    description: { type: String, maxlength: 200 },
    icon: String,
  },
  { timestamps: true }
);

categorySchema.pre('validate', function setSlug() {
  if (this.isModified('name') || !this.slug) this.slug = slugify(this.name);
});

categorySchema.set('toJSON', { versionKey: false });

module.exports = mongoose.model('Category', categorySchema);
