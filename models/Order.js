const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  barcode: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },

});

const paymentSchema = new mongoose.Schema({
  method: {
    type: String,
    enum: ['card', 'transfer'],
  },
  amount: {
    type: Number,
    required: true
  },
  transactionReference: String,
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const orderSchema = new mongoose.Schema({
  // Customer identification (anonymous or registered)
  customerId: {
    type: String
  },

  receiptNumber: {
    type: Number,
    required: true
  },

  // Order items
  items: [orderItemSchema],

  // Pricing
  subtotal: {
    type: Number,
    required: true
  },
  tax: {
    type: Number,
    default: 0
  },

  total: {
    type: Number,
    required: true
  },

  // Payment information
  payment: paymentSchema,

  // Order status
  status: {
    type: String,
    enum: ['created', 'processing', 'completed', 'cancelled', 'refunded'],
    default: 'created'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
orderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', orderSchema);