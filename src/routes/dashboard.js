// src/routes/dashboard.js
import express from 'express';
import {
  getDashboardOverview,
  getSalesAnalytics,
  getInventoryOverview,
  getStaffPerformance,
  getSubscriptionStatus,
  getQuickStats
} from '../controllers/pharmacy/dashboardController.js';
import { authenticate } from '../middleware/authMiddleware.js'; // Import here
import { authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes require authentication - add it here
router.use(authenticate);

// Dashboard routes
router.get('/overview', getDashboardOverview);
router.get('/sales-analytics', getSalesAnalytics);
router.get('/inventory-overview', getInventoryOverview);
router.get('/quick-stats', getQuickStats);
router.get('/subscription-status', getSubscriptionStatus);

// Staff performance - only for pharmacy owners
router.get('/staff-performance', authorize(['pharmacy_owner', 'super_admin']), getStaffPerformance);

export default router;