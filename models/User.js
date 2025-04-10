// models/Product.js
const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    trim: true
  },
 
});

module.exports = mongoose.model('User', UserSchema);