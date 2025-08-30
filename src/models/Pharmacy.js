import mongoose from 'mongoose';

const pharmacySchema = new mongoose.Schema({
  // Basic Information
  name: {
    type: String,
    required: [true, 'Pharmacy name is required'],
    trim: true,
    maxlength: [100, 'Pharmacy name cannot exceed 100 characters']
  },
  
  // Unique subdomain for the pharmacy (e.g., healthplus.kxbyte.com)
  subdomain: {
    type: String,
    required: [true, 'Subdomain is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^[a-z0-9-]+$/, 'Subdomain can only contain lowercase letters, numbers, and hyphens'],
    minlength: [3, 'Subdomain must be at least 3 characters'],
    maxlength: [50, 'Subdomain cannot exceed 50 characters']
  },
  
  // Pharmacy Type
  type: {
    type: String,
    enum: ['retail', 'hospital', 'clinic', 'wholesale'],
    required: [true, 'Pharmacy type is required']
  },
  
  // Owner Reference
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Owner ID is required']
  },
  
  // Location
  address: {
    street: {
      type: String,
      required: [true, 'Street address is required'],
      trim: true
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true
    },
    county: {
      type: String,
      required: [true, 'County is required'],
      trim: true
    },
    postalCode: {
      type: String,
      trim: true
    }
  },
  
  coordinates: {
    latitude: {
      type: Number,
      min: [-90, 'Invalid latitude'],
      max: [90, 'Invalid latitude']
    },
    longitude: {
      type: Number,
      min: [-180, 'Invalid longitude'],
      max: [180, 'Invalid longitude']
    }
  },
  
  // Contact Information
  contact: {
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^(?:\+254|0)?[17]\d{8}$/, 'Please enter a valid Kenyan phone number']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    website: {
      type: String,
      trim: true
    }
  },
  
  // Operating Hours (simplified)
  operatingHours: {
    weekdays: { type: String, default: '8:00 AM - 6:00 PM' },
    saturday: { type: String, default: '8:00 AM - 4:00 PM' },
    sunday: { type: String, default: '9:00 AM - 3:00 PM' }
  },
  
  // Simple Subscription
  subscription: {
    plan: {
      type: String,
      enum: ['STANDARD', 'PREMIUM'],
      default: 'STANDARD'
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    monthlyAmount: {
      type: Number,
      default: 2500 // KES
    },
    nextBilling: {
      type: Date,
      default: function() {
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    }
  },
  
  // Features (simplified)
  features: {
    maxStaff: {
      type: Number,
      default: function() {
        return this.subscription?.plan === 'PREMIUM' ? 50 : 10;
      }
    },
    maxProducts: {
      type: Number,
      default: function() {
        return this.subscription?.plan === 'PREMIUM' ? 20000 : 2000;
      }
    },
    websiteEnabled: {
      type: Boolean,
      default: true
    },
    reportsEnabled: {
      type: Boolean,
      default: function() {
        return this.subscription?.plan === 'PREMIUM';
      }
    }
  },
  
  // Basic Branding
  branding: {
  logo: String,
  favicon: String,
  primaryColor: {
    type: String,
    default: '#ff8800ff'
  },
  secondaryColor: {
    type: String,
    default: '#ec0606ff'
  },
  theme: {
    type: String,
    enum: ['light', 'dark'],
    default: 'light'
  }
},
  
  // Status
  status: {
    type: String,
    enum: ['active', 'suspended', 'closed'],
    default: 'active'
  },
  
  lastActivity: {
    type: Date,
    default: Date.now
  },
  
  // Basic Stats
  stats: {
    totalSales: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    totalProducts: { type: Number, default: 0 },
    totalStaff: { type: Number, default: 0 }
  },
  
  // Settings
  settings: {
    currency: { type: String, default: 'KES' },
    timezone: { type: String, default: 'Africa/Nairobi' },
    language: { type: String, enum: ['en', 'sw'], default: 'en' },
    lowStockAlert: { type: Number, default: 10 },
    expiryAlert: { type: Number, default: 30 }
  },
  
  // System Information
  createdFromApplication: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: {
    type: Date,
    default: Date.now
  }
  
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.fullAddress = `${ret.address.street}, ${ret.address.city}, ${ret.address.county}`;
      ret.daysInOperation = Math.floor((new Date() - ret.createdAt) / (1000 * 60 * 60 * 24));
      ret.websiteUrl = `https://${ret.subdomain}.kxbyte.com`;
      return ret;
    }
  }
});

// Indexes
pharmacySchema.index({ ownerId: 1 });
pharmacySchema.index({ status: 1 });
pharmacySchema.index({ 'address.county': 1 });
pharmacySchema.index({ type: 1 });
pharmacySchema.index({ subdomain: 1 }, { unique: true });

// Virtuals
pharmacySchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  return `${addr.street}, ${addr.city}, ${addr.county}${addr.postalCode ? ', ' + addr.postalCode : ''}`;
});

pharmacySchema.virtual('websiteUrl').get(function() {
  return `https://${this.subdomain}.kxbyte.com`;
});

pharmacySchema.virtual('daysInOperation').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Methods
pharmacySchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

pharmacySchema.methods.suspend = function() {
  this.status = 'suspended';
  this.subscription.status = 'suspended';
  return this.save();
};

pharmacySchema.methods.reactivate = function() {
  this.status = 'active';
  this.subscription.status = 'active';
  this.lastActivity = new Date();
  return this.save();
};

pharmacySchema.methods.upgradePlan = function(newPlan) {
  this.subscription.plan = newPlan;
  this.features.maxStaff = newPlan === 'PREMIUM' ? 50 : 10;
  this.features.maxProducts = newPlan === 'PREMIUM' ? 20000 : 2000;
  this.features.reportsEnabled = newPlan === 'PREMIUM';
  return this.save();
};

// Static methods
pharmacySchema.statics.findBySubdomain = function(subdomain) {
  return this.findOne({ subdomain: subdomain.toLowerCase() });
};

pharmacySchema.statics.getActivePharmacies = function(page = 1, limit = 20) {
  return this.find({ status: 'active' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .populate('ownerId', 'firstName lastName email phone');
};

pharmacySchema.statics.searchPharmacies = function(query, filters = {}) {
  let searchQuery = {};
  
  if (query) {
    searchQuery.$or = [
      { name: { $regex: query, $options: 'i' } },
      { subdomain: { $regex: query, $options: 'i' } },
      { 'contact.email': { $regex: query, $options: 'i' } },
      { 'address.city': { $regex: query, $options: 'i' } },
      { 'address.county': { $regex: query, $options: 'i' } }
    ];
  }
  
  if (filters.status) searchQuery.status = filters.status;
  if (filters.type) searchQuery.type = filters.type;
  if (filters.county) searchQuery['address.county'] = filters.county;
  
  return this.find(searchQuery)
    .sort({ createdAt: -1 })
    .populate('ownerId', 'firstName lastName email phone');
};

export default mongoose.model('Pharmacy', pharmacySchema);