// routes/pharmacy.js
import express from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { 
  getSetupStatus, 
  updateBasicInfo, 
  updateOperatingHours 
} from '../controllers/pharmacy/settingsController.js';

const router = express.Router();

// All pharmacy routes require authentication
router.use(authenticate);

// Setup status - for pharmacy owners only
router.get('/setup-status', 
  authenticate,
  authorize(['pharmacy_owner']), // Single array, no extra brackets
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

export default router;