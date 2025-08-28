import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  pharmacyName: {
    type: String,
    required: [true, 'Pharmacy name is required'],
    trim: true,
    maxlength: [150, 'Pharmacy name cannot exceed 150 characters'],
    minlength: [2, 'Pharmacy name must be at least 2 characters']
  },
  pharmacyType: {
    type: String,
    enum: ['retail', 'hospital', 'clinic', 'wholesale', 'specialty', 'community'],
    required: [true, 'Pharmacy type is required'],
    default: 'retail'
  },
  address: {
    street: { 
      type: String, 
      required: [true, 'Street address is required'], 
      trim: true,
      maxlength: [200, 'Street address too long']
    },
    city: { 
      type: String, 
      required: [true, 'City is required'], 
      trim: true,
      maxlength: [50, 'City name too long']
    },
    county: { 
      type: String, 
      required: [true, 'County is required'], 
      trim: true,
      maxlength: [50, 'County name too long']
    },
    postalCode: { 
      type: String, 
      trim: true,
      maxlength: [20, 'Postal code too long']
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
  owner: {
    firstName: { 
      type: String, 
      required: [true, 'First name is required'], 
      trim: true, 
      maxlength: [100, 'First name too long'],
      minlength: [1, 'First name required']
    },
    lastName: { 
      type: String, 
      required: [true, 'Last name is required'], 
      trim: true, 
      maxlength: [100, 'Last name too long'],
      minlength: [1, 'Last name required']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please enter a valid email address'],
      maxlength: [100, 'Email too long']
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      validate: {
        validator: function(phone) {
          const cleaned = phone.replace(/\D/g, '');
          return /^(254|0)?(7|1)\d{8}$/.test(cleaned) || /^\+254(7|1)\d{8}$/.test(phone);
        },
        message: 'Please enter a valid Kenyan phone number (e.g., 0712345678, +254712345678)'
      }
    }
  },

  operatingHours: {
    monday: { type: String, default: '8:00 AM - 6:00 PM' },
    tuesday: { type: String, default: '8:00 AM - 6:00 PM' },
    wednesday: { type: String, default: '8:00 AM - 6:00 PM' },
    thursday: { type: String, default: '8:00 AM - 6:00 PM' },
    friday: { type: String, default: '8:00 AM - 6:00 PM' },
    saturday: { type: String, default: '9:00 AM - 4:00 PM' },
    sunday: { type: String, default: 'Closed' }
  },
  
  additionalInfo: {
    description: { type: String, maxlength: [500, 'Description too long'] },
    website: { type: String, trim: true }
  },
  
  // System fields
  createdUserId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    default: null 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'under_review'],
    default: 'pending' 
  },
  applicationId: {
    type: String,
    unique: true,
    default: function () {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
      return `APP-${year}${month}-${random}`;
    }
  },
  submittedAt: { type: Date, default: Date.now },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  reviewNotes: { type: String, maxlength: [1000, 'Review notes too long'] },
  rejectionReason: { type: String, maxlength: [500, 'Rejection reason too long'] }
}, {
  timestamps: true,
  toJSON: {
    transform: function (doc, ret) {
      ret.fullOwnerName = `${ret.owner.firstName} ${ret.owner.lastName}`;
      ret.daysWaiting = Math.floor((new Date() - ret.submittedAt) / (1000 * 60 * 60 * 24));
      return ret;
    }
  }
});

// Indexes (removed licenseNumber index)
applicationSchema.index({ status: 1, submittedAt: -1 });
applicationSchema.index({ 'owner.email': 1 });
applicationSchema.index({ applicationId: 1 }, { unique: true });
applicationSchema.index({ pharmacyName: 1 });
// Add these static methods to your Application model:

// Static method to get pending applications with pagination
applicationSchema.statics.getPendingApplications = async function(page = 1, limit = 10) {
  const skip = (page - 1) * limit;
  
  return this.find({ status: 'pending' })
    .sort({ submittedAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('applicationId pharmacyName owner.firstName owner.lastName owner.email owner.phone submittedAt address.city address.county')
    .lean();
};

// Static method to search applications
applicationSchema.statics.searchApplications = async function(query, filters = {}) {
  const searchQuery = {
    ...filters,
    $or: [
      { pharmacyName: { $regex: query, $options: 'i' } },
      { 'owner.firstName': { $regex: query, $options: 'i' } },
      { 'owner.lastName': { $regex: query, $options: 'i' } },
      { 'owner.email': { $regex: query, $options: 'i' } },
      { applicationId: { $regex: query, $options: 'i' } },
      { 'address.city': { $regex: query, $options: 'i' } },
      { 'address.county': { $regex: query, $options: 'i' } }
    ]
  };

  return this.find(searchQuery)
    .sort({ submittedAt: -1 })
    .select('applicationId pharmacyName pharmacyType owner status submittedAt address')
    .lean();
};

// Instance method to reject application
applicationSchema.methods.reject = async function(adminId) {
  this.status = 'rejected';
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  
  // Deactivate the associated user
  if (this.createdUserId) {
    await User.findByIdAndUpdate(this.createdUserId, {
      status: 'inactive',
      lastModifiedBy: adminId
    });
  }
  
  return this.save();
}; 
// Virtuals
applicationSchema.virtual('fullOwnerName').get(function () {
  return `${this.owner.firstName} ${this.owner.lastName}`;
});

applicationSchema.virtual('daysWaiting').get(function () {
  return Math.floor((new Date() - this.submittedAt) / (1000 * 60 * 60 * 24));
});

applicationSchema.virtual('fullAddress').get(function () {
  const a = this.address;
  return `${a.street}, ${a.city}, ${a.county}${a.postalCode ? ', ' + a.postalCode : ''}`;
});

export default mongoose.model('Application', applicationSchema);