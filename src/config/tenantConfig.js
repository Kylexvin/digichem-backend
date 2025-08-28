/**
 * Tenant Configuration for Multi-tenant SaaS
 * Defines plans, features, and tenant-specific settings
 */

// Subscription Plans
export const SUBSCRIPTION_PLANS = {
  STANDARD: {
    name: 'Standard',
    price: 2500, // KES per month
    currency: 'KES',
    features: {
      maxStaff: 10,
      maxProducts: 2000,
      websiteEnabled: true,
      reportsEnabled: false,
      advancedReports: false,
      inventoryAlerts: true,
      multiLocation: false,
      apiAccess: false,
      customBranding: false,
      prioritySupport: false,
      dataBackup: 'weekly',
      storageLimit: '1GB'
    },
    limits: {
      transactionsPerMonth: 10000,
      apiCallsPerDay: 1000,
      emailNotifications: 100,
      smsNotifications: 50
    }
  },
  
  PREMIUM: {
    name: 'Premium',
    price: 5000, // KES per month
    currency: 'KES',
    features: {
      maxStaff: 50,
      maxProducts: 20000,
      websiteEnabled: true,
      reportsEnabled: true,
      advancedReports: true,
      inventoryAlerts: true,
      multiLocation: true,
      apiAccess: true,
      customBranding: true,
      prioritySupport: true,
      dataBackup: 'daily',
      storageLimit: '10GB'
    },
    limits: {
      transactionsPerMonth: 100000,
      apiCallsPerDay: 10000,
      emailNotifications: 1000,
      smsNotifications: 500
    }
  }
};

// Default tenant settings
export const DEFAULT_TENANT_SETTINGS = {
  currency: 'KES',
  timezone: 'Africa/Nairobi',
  language: 'en',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '12h',
  
  // Business settings
  taxRate: 16, // VAT in Kenya
  lowStockAlert: 10,
  expiryAlert: 30, // days
  
  // Receipt settings
  receiptHeader: '',
  receiptFooter: 'Thank you for your business!',
  showTaxOnReceipt: true,
  
  // Branding
  theme: 'light',
  primaryColor: '#007bff',
  secondaryColor: '#6c757d',
  
  // Notifications
  emailNotifications: {
    lowStock: true,
    expiry: true,
    dailySummary: false,
    weeklyReport: false
  },
  
  smsNotifications: {
    lowStock: false,
    expiry: false,
    dailySummary: false
  }
};

// Feature permissions for different user roles
export const ROLE_PERMISSIONS = {
  pharmacy_owner: {
    // Full access to everything in their pharmacy
    dashboard: { view: true, edit: true },
    inventory: { view: true, edit: true, delete: true },
    sales: { view: true, edit: true, delete: true },
    staff: { view: true, edit: true, delete: true },
    reports: { view: true, edit: true },
    settings: { view: true, edit: true },
    billing: { view: true, edit: false }, // Can view but not edit billing
    website: { view: true, edit: true }
  },
  
  attendant: {
    // Limited access - customizable by pharmacy owner
    dashboard: { view: true, edit: false },
    inventory: { view: 'configurable', edit: 'configurable', delete: 'configurable' },
    sales: { view: 'configurable', edit: 'configurable', delete: 'configurable' },
    staff: { view: false, edit: false, delete: false },
    reports: { view: 'configurable', edit: false },
    settings: { view: false, edit: false },
    billing: { view: false, edit: false },
    website: { view: false, edit: false }
  }
};

// Default attendant permissions (can be customized by pharmacy owner)
export const DEFAULT_ATTENDANT_PERMISSIONS = {
  inventory: {
    view: true,
    add: true,
    edit: false,
    delete: false,
    viewCosts: false // Hide cost prices
  },
  sales: {
    view: true,
    process: true,
    refund: false,
    discount: false,
    viewDailySales: false
  },
  reports: {
    view: false,
    export: false
  },
  dashboard: {
    viewSummary: true,
    viewGraphs: false
  }
};

// Tenant isolation configuration
export const TENANT_CONFIG = {
  // Database collection prefixes (if needed)
  collectionPrefix: false, // We use tenantId field instead
  
  // Subdomain configuration
  subdomainPattern: /^[a-z0-9-]{3,50}$/,
  reservedSubdomains: [
    'www', 'api', 'admin', 'app', 'dashboard',
    'support', 'help', 'blog', 'docs', 'status',
    'mail', 'ftp', 'test', 'staging', 'dev'
  ],
  
  // Data isolation
  isolationLevel: 'strict', // strict | flexible
  allowCrossTenantsAccess: ['super_admin'],
  
  // Resource limits per tenant
  maxFileUploadSize: '10MB',
  maxBackupRetention: 30, // days
  maxUserSessions: 10
};

// Utility functions
export const getTenantPlan = (planName) => {
  return SUBSCRIPTION_PLANS[planName] || SUBSCRIPTION_PLANS.STANDARD;
};

export const getPlanFeatures = (planName) => {
  const plan = getTenantPlan(planName);
  return plan.features;
};

export const checkFeatureAccess = (tenantPlan, featureName) => {
  const features = getPlanFeatures(tenantPlan);
  return features[featureName] || false;
};

export const getRolePermissions = (role) => {
  return ROLE_PERMISSIONS[role] || {};
};

export const hasPermission = (userRole, resource, action = 'view') => {
  const permissions = getRolePermissions(userRole);
  const resourcePerms = permissions[resource];
  
  if (!resourcePerms) return false;
  
  if (typeof resourcePerms === 'boolean') return resourcePerms;
  if (typeof resourcePerms === 'object') {
    return resourcePerms[action] === true || resourcePerms[action] === 'configurable';
  }
  
  return false;
};

export const isSubdomainAvailable = (subdomain) => {
  // Check format
  if (!TENANT_CONFIG.subdomainPattern.test(subdomain)) {
    return { available: false, reason: 'Invalid format' };
  }
  
  // Check reserved
  if (TENANT_CONFIG.reservedSubdomains.includes(subdomain.toLowerCase())) {
    return { available: false, reason: 'Reserved subdomain' };
  }
  
  return { available: true };
};

// Plan comparison helper
export const comparePlans = () => {
  return Object.entries(SUBSCRIPTION_PLANS).map(([key, plan]) => ({
    id: key,
    name: plan.name,
    price: plan.price,
    currency: plan.currency,
    features: plan.features,
    limits: plan.limits
  }));
};

// Upgrade/downgrade helpers
export const getUpgradePath = (currentPlan) => {
  if (currentPlan === 'STANDARD') {
    return ['PREMIUM'];
  }
  return [];
};

export const getDowngradePath = (currentPlan) => {
  if (currentPlan === 'PREMIUM') {
    return ['STANDARD'];
  }
  return [];
};

// Feature gate helper
export const createFeatureGate = (requiredFeature) => {
  return (tenantPlan) => {
    return checkFeatureAccess(tenantPlan, requiredFeature);
  };
};

export default {
  SUBSCRIPTION_PLANS,
  DEFAULT_TENANT_SETTINGS,
  ROLE_PERMISSIONS,
  DEFAULT_ATTENDANT_PERMISSIONS,
  TENANT_CONFIG,
  getTenantPlan,
  getPlanFeatures,
  checkFeatureAccess,
  getRolePermissions,
  hasPermission,
  isSubdomainAvailable,
  comparePlans,
  getUpgradePath,
  getDowngradePath,
  createFeatureGate
};