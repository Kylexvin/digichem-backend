import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";

const userSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  
  email: {
    type: String,
    required: function () {
      return this.role === 'pharmacy_owner';
    },
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please enter a valid email'
    ]
  },

  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^(?:\+254|0)?[17]\d{8}$/, 'Please enter a valid Kenyan phone number']
  },
  
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters long'],
    select: false 
  },
  
  // User Role & Tenant Information
  role: {
    type: String,
    required: [true, 'User role is required'],
    enum: {
      values: ['super_admin', 'pharmacy_owner', 'attendant'],
      message: 'Role must be either super_admin, pharmacy_owner, or attendant'
    }
  },
  
  // Tenant ID - null for super_admin, pharmacy ID for others
  tenantId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'Pharmacy',
  default: null,    
  validate: {
    validator: function(v) {
      if (this.role === 'super_admin') {
        return v === null || v === undefined;
      }
      // For pharmacy users, allow null at creation
      return true;
    },
    message: 'Invalid tenantId for this role'
  }
},

  // Account Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending'],
    default: 'pending'
  },
  
  isEmailVerified: {
    type: Boolean,
    default: false
  },
  
  // Attendant-specific fields
  permissions: {
    // Only relevant for attendants
    sales: {
      type: Boolean,
      default: true
    },
    inventory: {
      type: String,
      enum: ['none', 'view', 'edit'],
      default: 'view'
    },
    reports: {
      type: Boolean,
      default: false
    },
    customers: {
      type: String,
      enum: ['none', 'view', 'edit'],
      default: 'view'
    },
    settings: {
      type: Boolean,
      default: false
    },
    refunds: {
      type: Boolean,
      default: false
    },
     discounts: {
    type: String,
    enum: ['none', 'limited', 'full'],
    default: 'none'
  },
  
  overrideStock: {
    type: Boolean,
    default: false
  }
},
  
  // Profile & Preferences
  profilePicture: {
    type: String,
    default: null
  },
  
  language: {
    type: String,
    enum: ['en', 'sw'],
    default: 'en'
  },
  
  timezone: {
    type: String,
    default: 'Africa/Nairobi'
  },
  
  // Security & Session Management
  lastLogin: {
    type: Date,
    default: null
  },
  
  loginAttempts: {
    type: Number,
    default: 0
  },
  
  lockUntil: {
    type: Date,
    default: null
  },
  
  refreshTokens: [{
    token: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 604800 // 7 days in seconds
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
      location: String
    }
  }],
  
  // Password Reset
  passwordResetToken: {
    type: String,
    default: null
  },
  
  passwordResetExpires: {
    type: Date,
    default: null
  },
  
  // Email Verification
  emailVerificationToken: {
    type: String,
    default: null
  },
  
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  
  // Audit Trail
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
  
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Remove sensitive information when converting to JSON
      delete ret.password;
      delete ret.refreshTokens;
      delete ret.passwordResetToken;
      delete ret.emailVerificationToken;
      delete ret.loginAttempts;
      delete ret.lockUntil;
      return ret;
    }
  }
});

// Enforce unique email per tenant
// Unique global email for owners and super admins
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { role: { $in: ['super_admin', 'pharmacy_owner'] } } }
);

// Unique email per tenant for attendants (only if email exists)
userSchema.index(
  { tenantId: 1, email: 1 },
  { unique: true, sparse: true, partialFilterExpression: { role: 'attendant', email: { $exists: true } } }
);

// Other useful indexes
userSchema.index({ tenantId: 1, role: 1 });
userSchema.index({ tenantId: 1, status: 1 });
userSchema.index({ role: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual to check if account is locked
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with salt rounds of 12
    this.password = await bcrypt.hash(this.password, 12);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to set default permissions based on role
userSchema.pre('save', function(next) {
  // Clear permissions for non-attendants (owners and super_admins)
  if (this.role !== 'attendant') {
    this.permissions = undefined;
  }
  
  // Only set permissions for NEW attendants
  if (this.role === 'attendant' && this.isNew) {
    this.permissions = {
      sales: true,
      inventory: 'view',
      reports: false,
      customers: 'view',
      settings: false,
      refunds: false,
      discounts: 'none',
      overrideStock: false 
    };
  }
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

// Instance method to generate refresh token
userSchema.methods.generateRefreshToken = function(deviceInfo = {}) {
  const refreshToken = jwt.sign(
    { id: this._id, role: this.role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "7d" }
  );

  // Store it in user's refreshTokens array
  this.refreshTokens.push({
    token: refreshToken,
    deviceInfo,
    createdAt: new Date()
  });

  return refreshToken;
};


// Instance method to remove refresh token
userSchema.methods.removeRefreshToken = function(tokenToRemove) {
  this.refreshTokens = this.refreshTokens.filter(
    tokenObj => tokenObj.token !== tokenToRemove
  );
};

// Instance method to add refresh token
userSchema.methods.addRefreshToken = function(token, deviceInfo = {}) {
  this.refreshTokens.push({
    token,
    deviceInfo
  });
};

// Instance method to handle failed login attempts
userSchema.methods.handleFailedLogin = async function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // If we have max attempts and aren't already locked, lock the account
  const maxAttempts = 5;
  const lockTime = 2 * 60 * 60 * 1000; // 2 hours
  
  if (this.loginAttempts + 1 >= maxAttempts && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + lockTime };
  }
  
  return this.updateOne(updates);
};

// Instance method to handle successful login
userSchema.methods.handleSuccessfulLogin = async function() {
  // If we have attempts or lock info, remove it
  const updates = {
    $set: { lastLogin: Date.now() }
  };
  
  if (this.loginAttempts > 0 || this.lockUntil) {
    updates.$unset = {
      loginAttempts: 1,
      lockUntil: 1
    };
  }
  
  return this.updateOne(updates);
};

// Static method to find users by tenant
userSchema.statics.findByTenant = function(tenantId, role = null) {
  const query = { tenantId };
  if (role) query.role = role;
  return this.find(query);
};

// Static method to find available attendants for a pharmacy
userSchema.statics.findAvailableAttendants = function(tenantId) {
  return this.find({
    tenantId,
    role: 'attendant',
    status: 'active'
  }).select('firstName lastName email phone permissions lastLogin');
};

// Static method to count users by role for a tenant
userSchema.statics.countByRole = function(tenantId, role) {
  return this.countDocuments({ tenantId, role, status: { $ne: 'inactive' } });
};

// Static method to create super admin
userSchema.statics.createSuperAdmin = async function(userData) {
  const superAdmin = new this({
    ...userData,
    role: 'super_admin',
    tenantId: null,
    status: 'active',
    isEmailVerified: true
  });
  
  return superAdmin.save();
};

// Static method to create pharmacy owner
userSchema.statics.createPharmacyOwner = async function(userData, pharmacyId) {
  const owner = new this({
    ...userData,
    role: 'pharmacy_owner',
    tenantId: pharmacyId,
    status: 'active' // Activated immediately after pharmacy approval
  });
  
  return owner.save();
};

// Static method to create attendant
// In models/User.js - Fix the createAttendant static method
userSchema.statics.createAttendant = async function(userData, pharmacyId, permissions = {}) {
  const attendant = new this({
    ...userData,
    role: 'attendant',
    tenantId: pharmacyId,
    permissions: {
      sales: permissions.sales !== undefined ? permissions.sales : true,
      inventory: permissions.inventory || 'view',
      reports: permissions.reports || false,
      customers: permissions.customers || 'view',
      settings: permissions.settings || false,
      refunds: permissions.refunds || false,
      discounts: permissions.discounts || 'none', 
      overrideStock: permissions.overrideStock || false 
    },
    status: 'active'
  });
  
  return attendant.save();
};
  


// Method to check if user has specific permission
userSchema.methods.hasPermission = function(permission, level = null) {
  // Super admin and pharmacy owner have all permissions
  if (this.role === 'super_admin' || this.role === 'pharmacy_owner') {
    return true;
  }
  
  // For attendants, check specific permissions
  if (this.role === 'attendant') {
    if (!this.permissions || !this.permissions[permission]) {
      return false;
    }
    
    const permValue = this.permissions[permission];
    
    // Boolean permissions
    if (typeof permValue === 'boolean') {
      return permValue;
    }
    
    // String permissions with levels
    if (typeof permValue === 'string') {
      if (level === null) return permValue !== 'none';
      return permValue === level || (permValue === 'edit' && level === 'view');
    }
  }
  
  return false;
};

// Method to update permissions (only for attendants)
userSchema.methods.updatePermissions = async function(newPermissions) {
  if (this.role !== 'attendant') {
    throw new Error('Can only update permissions for attendants');
  }
  
  this.permissions = {
    ...this.permissions,
    ...newPermissions
  };
  
  return this.save();
};

const User = mongoose.model("User", userSchema);

export default User;