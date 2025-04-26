// models/Product.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
 
});

module.exports = mongoose.model('User', UserSchema);