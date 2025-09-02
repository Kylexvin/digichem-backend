// src/routes/staff.js
import express from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import {
  createStaff,
  getStaffList,
  updateStaffPermissions,
  getStaffOverview,
  getStaffDetails,
  getStaffActivityStatus,
  updateStaffStatus,
  deleteStaff,
  getAllStaffStatsWithTrends // new controller
} from '../controllers/pharmacy/staffController.js';

const router = express.Router();

router.use(authenticate);

// Staff management
router.post('/staff', authorize(['pharmacy_owner']), createStaff);
router.get('/staff', authorize(['pharmacy_owner']), getStaffList);
router.put('/staff/:staffId/permissions', authorize(['pharmacy_owner']), updateStaffPermissions);
router.patch('/staff/:staffId/status', authorize(['pharmacy_owner']), updateStaffStatus);
router.delete('/staff/:staffId', authorize(['pharmacy_owner']), deleteStaff);

// Staff reports & stats
router.get('/staff/overview', authorize(['pharmacy_owner', 'super_admin']), getStaffOverview);
router.get('/staff/activity-status', authorize(['pharmacy_owner', 'super_admin']), getStaffActivityStatus);
router.get('/staff/:staffId/details', authorize(['pharmacy_owner', 'super_admin']), getStaffDetails);

// New endpoint: fetch all staff stats with sales trends
router.get('/staff/stats', authorize(['pharmacy_owner', 'super_admin']), getAllStaffStatsWithTrends);

export default router;     
   