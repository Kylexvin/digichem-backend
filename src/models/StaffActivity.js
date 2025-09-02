import mongoose from 'mongoose';

const staffActivitySchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Pharmacy',
    required: true,
    index: true
  },
  staff: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    enum: ['login', 'logout', 'sale_completed'],
    required: true
  },
  details: {
    type: Object,
    default: {}
  },
  deviceInfo: {
    userAgent: String,
    ip: String,
    location: String
  }
}, {
  timestamps: true
});

// Index for fast tenant queries
staffActivitySchema.index({ tenantId: 1, createdAt: -1 });
staffActivitySchema.index({ staff: 1, createdAt: -1 });

// Static helper to log an activity
staffActivitySchema.statics.log = async function({ tenantId, staff, action, details = {}, deviceInfo = {} }) {
  return this.create({ tenantId, staff, action, details, deviceInfo });
};

export default mongoose.model('StaffActivity', staffActivitySchema);
