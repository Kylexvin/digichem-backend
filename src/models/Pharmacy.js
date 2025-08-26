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
    enum: ['retail', 'hospital', 'clinic', 'wholesale' ],
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
      trim: true,
      match: [/^https?:\/\/.+\..+/, 'Please enter a valid website URL']
    }
  },
  
  // Operating Hours
  operatingHours: {
    monday: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '18:00' },
      closed: { type: Boolean, default: false }
    },
    tuesday: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '18:00' },
      closed: { type: Boolean, default: false }
    },
    wednesday: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '18:00' },
      closed: { type: Boolean, default: false }
    },
    thursday: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '18:00' },
      closed: { type: Boolean, default: false }
    },
    friday: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '18:00' },
      closed: { type: Boolean, default: false }
    },
    saturday: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '16:00' },
      closed: { type: Boolean, default: false }
    },
    sunday: {
      open: { type: String, default: '09:00' },
      close: { type: String, default: '15:00' },
      closed: { type: Boolean, default: false }
    }
  },
  
  // Subscription & Plan - Payment agreement before approval
  subscription: {
    plan: {
      type: String,
      enum: ['STANDARD', 'PREMIUM'],
      required: [true, 'Subscription plan is required']
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled', 'pending_payment'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    // Payment agreement details - must be set before approval
    agreedMonthlyAmount: {
      type: Number,
      required: [true, 'Agreed monthly payment amount is required']
    },
    // Initial payment made (can be partial)
    initialPayment: {
      amount: {
        type: Number,
        required: [true, 'Initial payment amount is required']
      },
      date: {
        type: Date,
        default: Date.now
      },
      method: {
        type: String,
        required: true
      },
      transactionId: {
        type: String,
        required: true
      }
    },
    // Regular monthly payments tracking
    lastPayment: {
      date: Date,
      amount: Number,
      method: String,
      transactionId: String
    },
    nextBilling: {
      type: Date,
      default: function() {
        // Next billing in 30 days from approval
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    },
    // Payment agreement confirmation
    paymentAgreed: {
      type: Boolean,
      default: false,
      required: [true, 'Payment agreement must be confirmed before approval']
    },
    agreedDate: {
      type: Date,
      required: function() {
        return this.paymentAgreed;
      }
    }
  },
  
  // Features & Limits
  features: {
    maxStaff: {
      type: Number,
      default: function() {
        return this.subscription.plan === 'STANDARD' ? 10 : 50;
      }
    },
    maxProducts: {
      type: Number,
      default: function() {
        return this.subscription.plan === 'STANDARD' ? 2000 : 20000;
      }
    },
    websiteGeneration: {
      type: Boolean,
      default: true
    },
    advancedReports: {
      type: Boolean,
      default: function() {
        return this.subscription.plan === 'PREMIUM';
      }
    },
    inventoryAlerts: {
      type: Boolean,
      default: true
    },
    multiLocation: {
      type: Boolean,
      default: function() {
        return this.subscription.plan === 'PREMIUM';
      }
    },
    apiAccess: {
      type: Boolean,
      default: function() {
        return this.subscription.plan === 'PREMIUM';
      }
    },
    customReports: {
      type: Boolean,
      default: function() {
        return this.subscription.plan === 'PREMIUM';
      }
    }
  },
  
  // Customization & Branding
  branding: {
    logo: {
      type: String, // URL to logo file
      default: null
    },
    favicon: {
      type: String, // URL to favicon file
      default: null
    },
    theme: {
      type: String,
      enum: ['light', 'dark', 'auto'],
      default: 'light'
    },
    primaryColor: {
      type: String,
      default: '#007bff',
      match: [/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color']
    },
    secondaryColor: {
      type: String,
      default: '#28a745',
      match: [/^#[0-9A-F]{6}$/i, 'Please enter a valid hex color']
    },
    customCSS: {
      type: String,
      maxlength: [10000, 'Custom CSS cannot exceed 10000 characters']
    }
  },
  
  // Website Settings
  website: {
    enabled: {
      type: Boolean,
      default: true
    },
    template: {
      type: String,
      enum: ['modern', 'classic', 'minimal', 'pharmacy'],
      default: 'modern'
    },
    customDomain: {
      type: String,
      trim: true,
      lowercase: true
    },
    seoTitle: {
      type: String,
      maxlength: [60, 'SEO title cannot exceed 60 characters']
    },
    seoDescription: {
      type: String,
      maxlength: [160, 'SEO description cannot exceed 160 characters']
    },
    socialMedia: {
      facebook: String,
      twitter: String,
      instagram: String,
      linkedin: String
    }
  },
  
  // Status & Activity
  status: {
    type: String,
    enum: ['active', 'suspended', 'closed', 'maintenance'],
    default: 'active'
  },
  
  lastActivity: {
    type: Date,
    default: Date.now
  },
  
  // Statistics (Updated periodically)
  stats: {
    totalSales: {
      type: Number,
      default: 0
    },
    totalRevenue: {
      type: Number,
      default: 0
    },
    totalProducts: {
      type: Number,
      default: 0
    },
    totalStaff: {
      type: Number,
      default: 0
    },
    lastStatsUpdate: {
      type: Date,
      default: Date.now
    }
  },
  
  // Settings
  settings: {
    currency: {
      type: String,
      default: 'KES'
    },
    timezone: {
      type: String,
      default: 'Africa/Nairobi'
    },
    language: {
      type: String,
      enum: ['en', 'sw'],
      default: 'en'
    },
    notifications: {
      email: { type: Boolean, default: true },
      sms: { type: Boolean, default: true },
      push: { type: Boolean, default: true }
    },
    pos: {
      receiptFormat: {
        type: String,
        enum: ['standard', 'compact', 'detailed'],
        default: 'standard'
      },
      autoBackup: { type: Boolean, default: true },
      lowStockAlert: { type: Number, default: 10 },
      expiryAlert: { type: Number, default: 30 } // days before expiry
    }
  },
  
  // System Information
  createdFromApplication: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // Super admin who approved
  },
  
  approvedAt: {
    type: Date,
    default: Date.now
  }
  
}, {
  timestamps: true,
      toJSON: {
    transform: function(doc, ret) {
      // Add computed fields
      ret.daysInOperation = Math.floor((new Date() - ret.createdAt) / (1000 * 60 * 60 * 24));
      ret.fullAddress = `${ret.address.street}, ${ret.address.city}, ${ret.address.county}`;
      ret.daysUntilNextBilling = Math.max(0, Math.ceil((ret.subscription.nextBilling - new Date()) / (1000 * 60 * 60 * 24)));
      ret.monthlyAmount = ret.subscription.agreedMonthlyAmount; // What they see on dashboard
      ret.hasOutstandingBalance = ret.subscription.status === 'pending_payment';
      return ret;
    }
  }
});

// Indexes for performance
pharmacySchema.index({ ownerId: 1 });
pharmacySchema.index({ status: 1 });
pharmacySchema.index({ 'subscription.status': 1 });
pharmacySchema.index({ 'address.county': 1 });
pharmacySchema.index({ type: 1 });

// Virtual for full address
pharmacySchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  return `${addr.street}, ${addr.city}, ${addr.county}${addr.postalCode ? ', ' + addr.postalCode : ''}`;
});

// Virtual for website URL
pharmacySchema.virtual('websiteUrl').get(function() {
  if (this.website.customDomain) {
    return `https://${this.website.customDomain}`;
  }
  return `https://${this.subdomain}.kxbyte.com`;
});

// Virtual for next billing days
pharmacySchema.virtual('daysUntilNextBilling').get(function() {
  return Math.max(0, Math.ceil((this.subscription.nextBilling - new Date()) / (1000 * 60 * 60 * 24)));
});

// Virtual for monthly amount (what user sees)
pharmacySchema.virtual('monthlyAmount').get(function() {
  return this.subscription.agreedMonthlyAmount;
});

// Virtual for payment status
pharmacySchema.virtual('hasOutstandingBalance').get(function() {
  return this.subscription.status === 'pending_payment';
});

// Virtual for days in operation
pharmacySchema.virtual('daysInOperation').get(function() {
  return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update features based on subscription plan
pharmacySchema.pre('save', function(next) {
  if (this.isModified('subscription.plan')) {
    this.updateFeaturesByPlan();
  }
  next();
});

// Method to update features based on subscription plan
pharmacySchema.methods.updateFeaturesByPlan = function() {
  const plan = this.subscription.plan;
  
  this.features = {
    maxStaff: plan === 'STANDARD' ? 10 : 50,
    maxProducts: plan === 'STANDARD' ? 2000 : 20000,
    websiteGeneration: true,
    advancedReports: plan === 'PREMIUM',
    inventoryAlerts: true,
    multiLocation: plan === 'PREMIUM',
    apiAccess: plan === 'PREMIUM',
    customReports: plan === 'PREMIUM'
  };
  
  return this;
};

// Method to check if feature is available
pharmacySchema.methods.hasFeature = function(featureName) {
  return this.features[featureName] === true;
};

// Method to check if within limits
pharmacySchema.methods.withinLimits = function(limitType, currentCount) {
  const limit = this.features[`max${limitType.charAt(0).toUpperCase() + limitType.slice(1)}`];
  return currentCount < limit;
};

// Method to confirm payment agreement and initial payment before approval
pharmacySchema.methods.confirmPaymentAgreement = function(plan, monthlyAmount, initialPayment) {
  this.subscription.plan = plan;
  this.subscription.agreedMonthlyAmount = monthlyAmount;
  this.subscription.paymentAgreed = true;
  this.subscription.agreedDate = new Date();
  this.subscription.initialPayment = {
    amount: initialPayment.amount,
    date: new Date(),
    method: initialPayment.method,
    transactionId: initialPayment.transactionId
  };
  this.subscription.status = 'active';
  
  this.updateFeaturesByPlan();
  
  return this.save();
};

// Method to process monthly payment
pharmacySchema.methods.processMonthlyPayment = function(paymentDetails) {
  this.subscription.status = 'active';
  this.subscription.lastPayment = {
    date: new Date(),
    amount: paymentDetails.amount,
    method: paymentDetails.method,
    transactionId: paymentDetails.transactionId
  };
  
  // Set next billing date (monthly)
  this.subscription.nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  return this.save();
};

// Method to mark payment as overdue
pharmacySchema.methods.markPaymentOverdue = function() {
  this.subscription.status = 'pending_payment';
  return this.save();
};

// Method to upgrade subscription
pharmacySchema.methods.upgradePlan = function(newPlan, paymentDetails) {
  this.subscription.plan = newPlan;
  this.subscription.status = 'active';
  this.subscription.lastPayment = {
    date: new Date(),
    amount: paymentDetails.amount,
    method: paymentDetails.method,
    transactionId: paymentDetails.transactionId
  };
  
  // Set next billing date (monthly)
  this.subscription.nextBilling = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  
  this.updateFeaturesByPlan();
  
  return this.save();
};

// Method to suspend pharmacy
pharmacySchema.methods.suspend = function(reason) {
  this.status = 'suspended';
  this.subscription.status = 'suspended';
  // Could add suspension reason logging here
  return this.save();
};

// Method to reactivate pharmacy
pharmacySchema.methods.reactivate = function() {
  this.status = 'active';
  this.subscription.status = 'active';
  this.lastActivity = new Date();
  return this.save();
};

// Method to update activity timestamp
pharmacySchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Static method to find by subdomain
pharmacySchema.statics.findBySubdomain = function(subdomain) {
  return this.findOne({ subdomain: subdomain.toLowerCase() });
};

// Static method to get active pharmacies
pharmacySchema.statics.getActivePharmacies = function(page = 1, limit = 20) {
  return this.find({ status: 'active' })
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .populate('ownerId', 'firstName lastName email phone');
};

// Static method to search pharmacies
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
  
  // Apply filters
  if (filters.status) searchQuery.status = filters.status;
  if (filters.type) searchQuery.type = filters.type;
  if (filters.county) searchQuery['address.county'] = filters.county;
  if (filters.plan) searchQuery['subscription.plan'] = filters.plan;
  
  return this.find(searchQuery)
    .sort({ createdAt: -1 })
    .populate('ownerId', 'firstName lastName email phone');
};

// Static method to get pharmacies by plan
pharmacySchema.statics.getByPlan = function(plan) {
  return this.find({ 'subscription.plan': plan, status: 'active' })
    .populate('ownerId', 'firstName lastName email');
};

// Static method to get overdue payments
pharmacySchema.statics.getOverduePayments = function() {
  return this.find({
    'subscription.nextBilling': { $lt: new Date() },
    'subscription.status': 'active',
    status: 'active'
  }).populate('ownerId', 'firstName lastName email phone');
};

// Static method to get pending payments
pharmacySchema.statics.getPendingPayments = function() {
  return this.find({
    'subscription.status': 'pending_payment',
    status: 'active'
  }).populate('ownerId', 'firstName lastName email phone');
};

// Static method to get pharmacies needing payment agreement
pharmacySchema.statics.getNeedingPaymentAgreement = function() {
  return this.find({
    'subscription.paymentAgreed': false,
    status: 'active'
  }).populate('ownerId', 'firstName lastName email phone');
};

// Method to update statistics
pharmacySchema.methods.updateStats = async function(stats) {
  this.stats = {
    ...this.stats,
    ...stats,
    lastStatsUpdate: new Date()
  };
  return this.save();
};

// Method to get current operating hours for today
pharmacySchema.methods.getTodayHours = function() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'lowercase' });
  return this.operatingHours[today];
};

// Method to check if currently open
pharmacySchema.methods.isCurrentlyOpen = function() {
  const now = new Date();
  const todayHours = this.getTodayHours();
  
  if (todayHours.closed) return false;
  
  const currentTime = now.toTimeString().slice(0, 5); // HH:MM format
  return currentTime >= todayHours.open && currentTime <= todayHours.close;
};

export default mongoose.model('Pharmacy', pharmacySchema);