import mongoose from 'mongoose';

const saleItemSchema = new mongoose.Schema({
  product: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  productName: {
    type: String,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [1, 'Quantity must be at least 1']
  },
  unitType: {
    type: String,
    enum: ['Tablets', 'Capsules', 'Bottles', 'Tubes', 'Packs', 'Units', 'Millilitres', 'Grams'],
    required: true
  },
  unitPrice: {
    type: Number,
    required: true,
    min: [0, 'Unit price cannot be negative']
  },
  total: {
    type: Number,
    required: true,
    min: [0, 'Total cannot be negative']
  }
});

const saleSchema = new mongoose.Schema({
  // Transaction Information
  receiptNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Tenant/Pharmacy Reference
  pharmacy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pharmacy',
    required: true,
    index: true
  },
  
  // Staff Information
  attendant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Sale Items
  items: [saleItemSchema],
  
  // Pricing & Payment
  subtotal: {
    type: Number,
    required: true,
    min: [0, 'Subtotal cannot be negative']
  },
  
  totalAmount: {
    type: Number,
    required: true,
    min: [0, 'Total amount cannot be negative']
  },
  
  amountPaid: {
    type: Number,
    required: true,
    min: [0, 'Amount paid cannot be negative']
  },
  
  changeDue: {
    type: Number,
    default: 0,
    min: [0, 'Change due cannot be negative']
  },
  
  // Kenyan Payment Methods
  paymentMethod: {
    type: String,
    enum: ['cash', 'mpesa', 'card', 'bank_transfer', 'insurance'],
    default: 'cash'
  },
  
  // Status & Metadata
  status: {
    type: String,
    enum: ['completed', 'pending', 'cancelled', 'refunded'],
    default: 'completed'
  },
  
  // Sales mode information
  metadata: {
    ignoreStock: {
      type: Boolean,
      default: false
    },
    stockWarnings: [{
      product: String,
      requested: Number,
      available: Number,
      deficit: Number
    }]
  },
  
  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }

}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
saleSchema.index({ pharmacy: 1, createdAt: -1 });
saleSchema.index({ attendant: 1, createdAt: -1 });
saleSchema.index({ receiptNumber: 1 }, { unique: true });

// Virtual for formatted receipt number
saleSchema.virtual('formattedReceipt').get(function() {
  return `REC-${this.receiptNumber}`;
});

// Pre-save middleware to generate receipt number

saleSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      // Generate receipt number if not provided
      if (!this.receiptNumber) {
        const count = await mongoose.model('Sale').countDocuments({ 
          pharmacy: this.pharmacy 
        });
        this.receiptNumber = `REC-${Date.now()}-${count + 1}`.slice(-15);
      }
    } catch (error) {
      // If count fails, use timestamp as fallback
      this.receiptNumber = `REC-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }
  }
  next();
});

export default mongoose.model('Sale', saleSchema);