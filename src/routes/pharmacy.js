// routes/pharmacy.js
import express from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { 
  getSetupStatus, 
  updateBasicInfo, 
  updateOperatingHours 
} from '../controllers/pharmacy/settingsController.js';
import {
  getBranding,
  updateBranding,
  uploadBrandImage,
  removeBrandImage
} from '../controllers/pharmacy/brandingController.js';
import dashboardRoutes from './dashboard.js'; // Import dashboard routes
import upload from '../middleware/uploadMiddleware.js';

const router = express.Router();

// All pharmacy routes require authentication
router.use(authenticate);

// Mount dashboard routes under /api/pharmacy/dashboard
router.use('/dashboard', dashboardRoutes);

// Setup status - for pharmacy owners only
router.get('/setup-status', 
  authorize(['pharmacy_owner']),
  getSetupStatus
);

// Update basic info - for pharmacy owners only
router.put('/basic-info',
  authorize(['pharmacy_owner']),
  updateBasicInfo
);

// Update operating hours - for pharmacy owners only  
router.put('/operating-hours',
  authorize(['pharmacy_owner']),
  updateOperatingHours
);

// Branding routes - for pharmacy owners only
router.get('/branding', 
  authorize(['pharmacy_owner']),
  getBranding
);

router.put('/branding',
  authorize(['pharmacy_owner']),
  updateBranding
);

router.post('/branding/upload', 
  authorize(['pharmacy_owner']),
  upload.single('image'),
  uploadBrandImage
);

router.delete('/branding/image',
  authorize(['pharmacy_owner']),
  removeBrandImage
);

export default router;  