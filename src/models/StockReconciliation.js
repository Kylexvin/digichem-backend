// Create new file: models/StockReconciliation.js
import mongoose from 'mongoose';

const stockReconciliationSchema = new mongoose.Schema({
  // Reference to the sale that caused the override
  saleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Sale',
    required: true
  },
  
  // Pharmacy reference for tenant isolation
  pharmacy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pharmacy',
    required: true
  },
  
  // Attendant who made the sale
  attendant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Product and stock information
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  
  productName: {
    type: String,
    required: true
  },
  
  quantitySold: {
    type: Number,
    required: true,
    min: 1
  },
  
  availableStock: {
    type: Number,
    required: true,
    min: 0
  },
  
  deficit: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Reconciliation status
  status: {
    type: String,
    enum: ['pending', 'investigating', 'resolved', 'adjusted'],
    default: 'pending'
  },
  
  // Resolution details
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  resolvedAt: {
    type: Date
  },
  
  resolutionNotes: {
    type: String,
    maxlength: 500
  },
  
  // Action taken
  action: {
    type: String,
    enum: ['stock_adjusted', 'written_off', 'customer_return', 'other']
  },
  
  // Audit trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }

}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes for efficient querying
stockReconciliationSchema.index({ pharmacy: 1, status: 1 });
stockReconciliationSchema.index({ saleId: 1 });
stockReconciliationSchema.index({ product: 1 });
stockReconciliationSchema.index({ attendant: 1 });
stockReconciliationSchema.index({ createdAt: -1 });

export default mongoose.model('StockReconciliation', stockReconciliationSchema);