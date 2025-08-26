import mongoose from 'mongoose';
import User from './User.js'; // Assuming User model is in same directory

const applicationSchema = new mongoose.Schema({
  // Pharmacy Information
  pharmacyName: {
    type: String,
    required: [true, 'Pharmacy name is required'],
    trim: true,
    maxlength: [100, 'Pharmacy name cannot exceed 100 characters']
  },
  
  pharmacyType: {
    type: String,
    enum: ['retail', 'hospital', 'clinic', 'wholesale'], // Removed 'online' to match Pharmacy schema
    required: [true, 'Pharmacy type is required']
  },
  
  // Location Information
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
      min: [-90, 'Latitude must be between -90 and 90'],
      max: [90, 'Latitude must be between -90 and 90']
    },
    longitude: {
      type: Number,
      min: [-180, 'Longitude must be between -180 and 180'],
      max: [180, 'Longitude must be between -180 and 180']
    }
  },
  
  // Owner Information
  owner: {
    firstName: {
      type: String,
      required: [true, 'Owner first name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters']
    },
    lastName: {
      type: String,
      required: [true, 'Owner last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters']
    },
    email: {
      type: String,
      required: [true, 'Owner email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
      type: String,
      required: [true, 'Owner phone number is required'],
      trim: true,
      match: [/^(?:\+254|0)?[17]\d{8}$/, 'Please enter a valid Kenyan phone number']
    }
  },
  
  // Link to created user account
  createdUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  // Application Status
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  
  // System Generated
  applicationId: {
    type: String,
    unique: true,
    default: function() {
      return 'APP-' + new Date().getFullYear() + '-' + 
             String(Math.floor(Math.random() * 10000)).padStart(4, '0');
    }
  },
  
  submittedAt: {
    type: Date,
    default: Date.now
  },
  
  // Admin who approved/rejected
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  reviewedAt: {
    type: Date,
    default: null
  },
  
  // Reference to created pharmacy (after approval)
  createdPharmacyId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pharmacy',
    default: null
  }
  
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      ret.fullOwnerName = `${ret.owner.firstName} ${ret.owner.lastName}`;
      ret.daysWaiting = Math.floor((new Date() - ret.submittedAt) / (1000 * 60 * 60 * 24));
      return ret;
    }
  }
});

// Indexes for performance
applicationSchema.index({ status: 1, submittedAt: -1 });
applicationSchema.index({ 'owner.email': 1 });

// Virtual for full owner name
applicationSchema.virtual('fullOwnerName').get(function() {
  return `${this.owner.firstName} ${this.owner.lastName}`;
});

// Virtual for days waiting
applicationSchema.virtual('daysWaiting').get(function() {
  return Math.floor((new Date() - this.submittedAt) / (1000 * 60 * 60 * 24));
});

// Virtual for full address
applicationSchema.virtual('fullAddress').get(function() {
  const addr = this.address;
  return `${addr.street}, ${addr.city}, ${addr.county}${addr.postalCode ? ', ' + addr.postalCode : ''}`;
});

// Static method to create application with user account
applicationSchema.statics.createWithUser = async function(applicationData) {
  const session = await mongoose.startSession();
  
  try {
    await session.withTransaction(async () => {
      // Create user account first
      const userData = {
        firstName: applicationData.owner.firstName,
        lastName: applicationData.owner.lastName,
        email: applicationData.owner.email,
        phone: applicationData.owner.phone,
        role: 'pharmacy_owner',
        status: 'pending', // Not active until application is approved
        isEmailVerified: false,
        password: 'temp_password_' + Math.random().toString(36).slice(-8) // Temporary password
      };
      
      const user = await User.create([userData], { session });
      
      // Create application
      const application = new this({
        ...applicationData,
        createdUserId: user[0]._id
      });
      
      const savedApplication = await application.save({ session });
      
      return { user: user[0], application: savedApplication };
    });
    
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

// Static method to get pending applications
applicationSchema.statics.getPendingApplications = function(page = 1, limit = 10) {
  return this.find({ status: 'pending' })
    .sort({ submittedAt: 1 })
    .limit(limit)
    .skip((page - 1) * limit)
    .populate('createdUserId', 'firstName lastName email phone status');
};

// Static method to search applications
applicationSchema.statics.searchApplications = function(query, filters = {}) {
  let searchQuery = {};
  
  if (query) {
    searchQuery.$or = [
      { pharmacyName: { $regex: query, $options: 'i' } },
      { 'owner.firstName': { $regex: query, $options: 'i' } },
      { 'owner.lastName': { $regex: query, $options: 'i' } },
      { 'owner.email': { $regex: query, $options: 'i' } },
      { applicationId: { $regex: query, $options: 'i' } }
    ];
  }
  
  // Apply filters
  if (filters.status) searchQuery.status = filters.status;
  if (filters.pharmacyType) searchQuery.pharmacyType = filters.pharmacyType;
  if (filters.county) searchQuery['address.county'] = filters.county;
  
  return this.find(searchQuery)
    .sort({ submittedAt: -1 })
    .populate('createdUserId', 'firstName lastName email phone status')
    .populate('reviewedBy', 'firstName lastName email');
};

// Instance method to approve application and activate user
applicationSchema.methods.approve = async function(adminId, pharmacyData = {}) {
  const session = await mongoose.startSession();
  
  try {
    return await session.withTransaction(async () => {
      // Update application status
      this.status = 'approved';
      this.reviewedBy = adminId;
      this.reviewedAt = new Date();
      
      // Activate the user account
      if (this.createdUserId) {
        await User.findByIdAndUpdate(
          this.createdUserId,
          { 
            status: 'active',
            lastModifiedBy: adminId
          },
          { session }
        );
      }
      
      const savedApplication = await this.save({ session });
      
      // Optionally create pharmacy here or return application for manual pharmacy creation
      return savedApplication;
    });
  } catch (error) {
    throw error;
  } finally {
    await session.endSession();
  }
};

// Instance method to reject application
applicationSchema.methods.reject = async function(adminId, reason = '') {
  this.status = 'rejected';
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  
  // Optionally deactivate user account
  if (this.createdUserId) {
    await User.findByIdAndUpdate(
      this.createdUserId,
      { 
        status: 'inactive',
        lastModifiedBy: adminId
      }
    );
  }
  
  return this.save();
};

// Method to link created pharmacy
applicationSchema.methods.linkPharmacy = function(pharmacyId) {
  this.createdPharmacyId = pharmacyId;
  return this.save();
};

export default mongoose.model('Application', applicationSchema);