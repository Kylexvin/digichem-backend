// src/models/Product.js
import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    maxlength: [100, 'Product name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Product category is required'],
    trim: true,
    index: true
  },
  // Kenyan Pharmacy Specific
  drugType: {
    type: String,
    enum: ['Prescription', 'OTC', 'Controlled', 'Herbal', 'Medical Supply'],
    default: 'OTC'
  },
  // Pricing Structure
  pricing: {
    costPerPack: {
      type: Number,
      required: [true, 'Cost per pack is required'],
      min: [0, 'Cost cannot be negative'],
      default: 0
    },
    sellingPricePerPack: {
      type: Number,
      required: [true, 'Selling price per pack is required'],
      min: [0, 'Selling price cannot be negative'],
      default: 0,
      validate: {
        validator: function(value) {
          return value >= (this.pricing?.costPerPack || 0);
        },
        message: 'Selling price must be greater than or equal to cost price'
      }
    },
    unitsPerPack: {
      type: Number,
      required: [true, 'Units per pack is required'],
      min: [1, 'Must have at least 1 unit per pack'],
      default: 1
    }
  },
  // Stock Management
  stock: {
    fullPacks: {
      type: Number,
      required: true,
      min: [0, 'Cannot have negative packs'],
      default: 0
    },
    looseUnits: {
      type: Number,
      required: true,
      min: [0, 'Cannot have negative units'],
      default: 0
    },
    minStockLevel: {
      type: Number,
      min: [0, 'Minimum stock level cannot be negative'],
      default: 10
    },
    maxStockLevel: {
      type: Number,
      min: [0, 'Maximum stock level cannot be negative'],
      default: 100
    }
  },
  // Identification
  sku: {
    type: String,
    unique: true,
    sparse: true,
    uppercase: true,
    match: [/^[A-Z0-9-]+$/, 'SKU can only contain uppercase letters, numbers, and hyphens']
  },
  barcode: {
    type: String,
    sparse: true,
    trim: true
  },
  // Expiry & Batch
  expiryDate: {
    type: Date,
    validate: {
      validator: function(value) {
        return !value || value > new Date();
      },
      message: 'Expiry date must be in the future'
    }
  },
  batchNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  manufacturer: {
    type: String,
    trim: true
  },
  supplier: {
    type: String,
    trim: true
  },
  // Unit Information
  unitType: {
    type: String,
    enum: ['Tablets', 'Capsules', 'Bottles', 'Tubes', 'Packs', 'Units'],
    default: 'Tablets'
  },
  // Tenant Reference
  pharmacy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pharmacy',
    required: [true, 'Pharmacy reference is required'],
    index: true
  },
  // Status & Audit
  status: {
    type: String,
    enum: ['active', 'inactive', 'discontinued'],
    default: 'active'
  },
  isPrescriptionRequired: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator reference is required']
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret.createdAt;
      delete ret.updatedAt;
      return ret;
    }
  }
});

// ==================== VIRTUAL FIELDS ====================
productSchema.virtual('pricing.pricePerUnit').get(function() {
  if (!this.pricing?.sellingPricePerPack || !this.pricing?.unitsPerPack || this.pricing.unitsPerPack === 0) {
    return 0;
  }
  return this.pricing.sellingPricePerPack / this.pricing.unitsPerPack;
});

productSchema.virtual('stock.totalUnits').get(function() {
  const fullPacks = this.stock?.fullPacks || 0;
  const looseUnits = this.stock?.looseUnits || 0;
  const unitsPerPack = this.pricing?.unitsPerPack || 1;
  return (fullPacks * unitsPerPack) + looseUnits;
});

productSchema.virtual('stockValue').get(function() {
  const fullPacks = this.stock?.fullPacks || 0;
  const looseUnits = this.stock?.looseUnits || 0;
  const costPerPack = this.pricing?.costPerPack || 0;
  const unitsPerPack = this.pricing?.unitsPerPack || 1;
  if (unitsPerPack === 0) return 0;
  return (fullPacks * costPerPack) + (looseUnits * (costPerPack / unitsPerPack));
});

productSchema.virtual('profitMargin').get(function() {
  const sellingPrice = this.pricing?.sellingPricePerPack || 0;
  const costPrice = this.pricing?.costPerPack || 0;
  if (costPrice === 0) return 0;
  return ((sellingPrice - costPrice) / costPrice) * 100;
});

productSchema.virtual('stockStatus').get(function() {
  const total = this.stock.totalUnits;
  const minStock = this.stock?.minStockLevel || 0;
  if (total === 0) return 'out_of_stock';
  if (total <= minStock) return 'low_stock';
  return 'in_stock';
});

productSchema.virtual('isLowStock').get(function() {
  return this.stock.totalUnits <= (this.stock?.minStockLevel || 0);
});

productSchema.virtual('needsRestock').get(function() {
  return this.stock.totalUnits <= (this.stock?.minStockLevel || 0);
});

productSchema.virtual('restockQuantity').get(function() {
  const total = this.stock.totalUnits;
  const maxStock = this.stock?.maxStockLevel || 0;
  return Math.max(0, maxStock - total);
});

// ==================== INDEXES ====================
productSchema.index({ pharmacy: 1, category: 1 });
productSchema.index({ pharmacy: 1, status: 1 });
productSchema.index({ pharmacy: 1, drugType: 1 });
productSchema.index({ pharmacy: 1, sku: 1 }, { unique: true, sparse: true });
productSchema.index({ pharmacy: 1, barcode: 1 }, { sparse: true });
productSchema.index({ pharmacy: 1, expiryDate: 1 });
productSchema.index({ pharmacy: 1, 'stock.fullPacks': 1 });
productSchema.index({ pharmacy: 1, 'stock.looseUnits': 1 });

// ==================== PRE-SAVE MIDDLEWARE ====================
productSchema.pre('save', function(next) {
  if (!this.sku && this.isNew) {
    const randomSuffix = Math.random().toString(36).substr(2, 6).toUpperCase();
    this.sku = `PRD-${Date.now().toString(36).toUpperCase()}-${randomSuffix}`;
  }
  if (this.pricing?.sellingPricePerPack < this.pricing?.costPerPack) {
    this.pricing.sellingPricePerPack = this.pricing.costPerPack;
  }
  next();
});

// ==================== METHODS ====================
productSchema.methods.addStock = function(packs, units = 0) {
  this.stock.fullPacks += packs;
  this.stock.looseUnits += units;
  const unitsPerPack = this.pricing?.unitsPerPack || 1;
  const additionalPacks = Math.floor(this.stock.looseUnits / unitsPerPack);
  this.stock.fullPacks += additionalPacks;
  this.stock.looseUnits %= unitsPerPack;
  return this.save();
};

productSchema.methods.sellStock = function(packs, units) {
  const unitsPerPack = this.pricing?.unitsPerPack || 1;
  const totalUnitsToSell = (packs * unitsPerPack) + units;
  const availableUnits = this.stock.totalUnits;
  if (totalUnitsToSell > availableUnits) {
    throw new Error(`Insufficient stock. Available: ${availableUnits}, Requested: ${totalUnitsToSell}`);
  }
  this.stock.fullPacks -= packs;
  this.stock.looseUnits = Math.max(0, this.stock.looseUnits - units);
  if (this.stock.looseUnits < 0) {
    const convert = Math.ceil(Math.abs(this.stock.looseUnits) / unitsPerPack);
    this.stock.fullPacks -= convert;
    this.stock.looseUnits += convert * unitsPerPack;
  }
  return this.save();
};

// ==================== STATIC METHODS ====================
productSchema.statics.findByPharmacy = function(pharmacyId, filters = {}) {
  return this.find({ pharmacy: pharmacyId, ...filters });
};

productSchema.statics.getLowStockProducts = async function(pharmacyId) {
  const products = await this.find({ pharmacy: pharmacyId, status: 'active' });
  return products.filter(p => p.stock.totalUnits <= (p.stock?.minStockLevel || 0) && p.stock.totalUnits > 0);
};

productSchema.statics.findByCategory = function(pharmacyId, category) {
  return this.find({
    pharmacy: pharmacyId,
    category: new RegExp(category, 'i'),
    status: 'active'
  });
};

export default mongoose.model('Product', productSchema);
