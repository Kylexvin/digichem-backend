import Pharmacy from '../models/Pharmacy.js';

/**
 * Tenant identification middleware
 * Determines which pharmacy (tenant) the request is for
 */
export const identifyTenant = async (req, res, next) => {
  try {
    let tenantId = null;
    let pharmacy = null;

    // Method 1: From authenticated user (most common)
    if (req.user && req.user.tenantId) {
      tenantId = req.user.tenantId;
      pharmacy = await Pharmacy.findById(tenantId);
    }
    
    // Method 2: From subdomain (for website access)
    else if (req.headers.host) {
      const subdomain = req.headers.host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
        pharmacy = await Pharmacy.findBySubdomain(subdomain);
        if (pharmacy) {
          tenantId = pharmacy._id;
        }
      }
    }
    
    // Method 3: From request parameters (admin access)
    else if (req.params.tenantId || req.query.tenantId) {
      tenantId = req.params.tenantId || req.query.tenantId;
      pharmacy = await Pharmacy.findById(tenantId);
    }

    // Add tenant info to request
    req.tenant = {
      id: tenantId,
      pharmacy: pharmacy,
      subdomain: pharmacy?.subdomain
    };

    next();
    
  } catch (error) {
    console.error('Tenant identification error:', error);
    req.tenant = { id: null, pharmacy: null, subdomain: null };
    next();
  }
};

/**
 * Enforce tenant isolation
 * Ensures users can only access their own pharmacy's data
 */
export const enforceTenantIsolation = (req, res, next) => {
  // Super admin can access any tenant
  if (req.user?.role === 'super_admin') {
    return next();
  }

  // Must have authenticated user
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  // Must have tenant ID
  if (!req.user.tenantId) {
    return res.status(403).json({
      success: false,
      message: 'No pharmacy associated with your account'
    });
  }

  // Check if pharmacy exists and is active
  if (!req.tenant.pharmacy) {
    return res.status(404).json({
      success: false,
      message: 'Pharmacy not found or inactive'
    });
  }

  if (req.tenant.pharmacy.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: `Pharmacy is currently ${req.tenant.pharmacy.status}. Please contact support.`
    });
  }

  // Ensure user belongs to this pharmacy
  if (req.user.tenantId.toString() !== req.tenant.id.toString()) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. You can only access your own pharmacy data.'
    });
  }

  // Add tenant filter for database queries
  req.tenantFilter = { 
    tenantId: req.tenant.id 
  };

  next();
};

/**
 * Subscription check middleware
 * Ensures pharmacy has active subscription
 */
export const checkSubscription = (req, res, next) => {
  // Super admin bypass
  if (req.user?.role === 'super_admin') {
    return next();
  }

  const pharmacy = req.tenant?.pharmacy;
  
  if (!pharmacy) {
    return res.status(404).json({
      success: false,
      message: 'Pharmacy not found'
    });
  }

  // Check subscription status
  if (pharmacy.subscription.status !== 'active') {
    return res.status(403).json({
      success: false,
      message: 'Subscription inactive. Please contact support to reactivate.',
      subscriptionStatus: pharmacy.subscription.status,
      plan: pharmacy.subscription.plan
    });
  }

  // Check if subscription is overdue (simple check)
  if (pharmacy.subscription.nextBilling < new Date()) {
    return res.status(402).json({
      success: false,
      message: 'Subscription payment overdue. Please update your payment.',
      nextBilling: pharmacy.subscription.nextBilling,
      plan: pharmacy.subscription.plan
    });
  }

  next();
};

/**
 * Feature gate middleware
 * Checks if pharmacy has access to specific features
 */
export const requireFeature = (featureName) => {
  return (req, res, next) => {
    // Super admin bypass
    if (req.user?.role === 'super_admin') {
      return next();
    }

    const pharmacy = req.tenant?.pharmacy;
    
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    const features = pharmacy.features;
    
    // Check if feature is enabled
    if (!features[featureName]) {
      return res.status(403).json({
        success: false,
        message: `${featureName} feature is not available in your current plan`,
        currentPlan: pharmacy.subscription.plan,
        upgradeRequired: true
      });
    }

    next();
  };
};

/**
 * Staff limit check middleware
 * Ensures pharmacy doesn't exceed staff limits
 */
export const checkStaffLimit = async (req, res, next) => {
  try {
    // Super admin bypass
    if (req.user?.role === 'super_admin') {
      return next();
    }

    const pharmacy = req.tenant?.pharmacy;
    
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    // Get current staff count (you'll need to implement this based on your User model)
    // const currentStaffCount = await User.countDocuments({ tenantId: pharmacy._id, role: 'attendant' });
    const currentStaffCount = pharmacy.stats.totalStaff || 0;
    
    if (currentStaffCount >= pharmacy.features.maxStaff) {
      return res.status(403).json({
        success: false,
        message: `Staff limit reached. Your ${pharmacy.subscription.plan} plan allows up to ${pharmacy.features.maxStaff} staff members.`,
        currentStaff: currentStaffCount,
        maxStaff: pharmacy.features.maxStaff,
        upgradeRequired: true
      });
    }

    req.staffInfo = {
      current: currentStaffCount,
      max: pharmacy.features.maxStaff,
      available: pharmacy.features.maxStaff - currentStaffCount
    };

    next();
    
  } catch (error) {
    console.error('Staff limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check staff limits'
    });
  }
};

/**
 * Product limit check middleware
 */
export const checkProductLimit = async (req, res, next) => {
  try {
    // Super admin bypass
    if (req.user?.role === 'super_admin') {
      return next();
    }

    const pharmacy = req.tenant?.pharmacy;
    
    if (!pharmacy) {
      return res.status(404).json({
        success: false,
        message: 'Pharmacy not found'
      });
    }

    // Get current product count (you'll need to implement this based on your Product model)
    const currentProductCount = pharmacy.stats.totalProducts || 0;
    
    if (currentProductCount >= pharmacy.features.maxProducts) {
      return res.status(403).json({
        success: false,
        message: `Product limit reached. Your ${pharmacy.subscription.plan} plan allows up to ${pharmacy.features.maxProducts} products.`,
        currentProducts: currentProductCount,
        maxProducts: pharmacy.features.maxProducts,
        upgradeRequired: true
      });
    }

    req.productInfo = {
      current: currentProductCount,
      max: pharmacy.features.maxProducts,
      available: pharmacy.features.maxProducts - currentProductCount
    };

    next();
    
  } catch (error) {
    console.error('Product limit check error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check product limits'
    });
  }
};

/**
 * Update pharmacy activity
 */
export const updatePharmacyActivity = async (req, res, next) => {
  try {
    if (req.tenant?.pharmacy && req.user?.role !== 'super_admin') {
      // Update last activity timestamp
      await Pharmacy.findByIdAndUpdate(
        req.tenant.id,
        { lastActivity: new Date() },
        { timestamps: false } // Don't update updatedAt
      );
    }
    next();
  } catch (error) {
    // Don't fail the request if activity update fails
    console.error('Failed to update pharmacy activity:', error);
    next();
  }
};