// src/models/InventoryLog.js - UPDATED
import mongoose from 'mongoose';

const inventoryLogSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  pharmacy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pharmacy',
    required: true
  },
  action: {
    type: String,
    enum: ['create', 'update', 'delete', 'stock_adjust', 'stock_add', 'stock_remove', 'sale'], // ADDED 'sale'
    required: true
  },
  performedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  previousState: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  newState: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Index for better query performance
inventoryLogSchema.index({ product: 1, createdAt: -1 });
inventoryLogSchema.index({ pharmacy: 1, action: 1 });
inventoryLogSchema.index({ performedBy: 1 });

const InventoryLog = mongoose.model('InventoryLog', inventoryLogSchema);

export default InventoryLog;