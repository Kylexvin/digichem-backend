// src/routes/staff.js
import express from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import {
  createStaff,
  getStaffList,
  updateStaffPermissions,
  getStaffOverview,       // Add this import
  getStaffDetails,        // Add this import
  getStaffActivityStatus  // Add this import
} from '../controllers/pharmacy/staffController.js';

const router = express.Router();

router.use(authenticate);

// Existing routes
router.post('/staff', authorize(['pharmacy_owner']), createStaff);
router.get('/staff', authorize(['pharmacy_owner']), getStaffList);
router.put('/staff/:staffId/permissions', authorize(['pharmacy_owner']), updateStaffPermissions);

// NEW ROUTES - Add these
router.get('/staff/overview', authorize(['pharmacy_owner', 'super_admin']), getStaffOverview);
router.get('/staff/activity-status', authorize(['pharmacy_owner', 'super_admin']), getStaffActivityStatus);
router.get('/staff/:staffId/details', authorize(['pharmacy_owner', 'super_admin']), getStaffDetails);

export default router;