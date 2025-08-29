// src/routes/staff.js
import express from 'express';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import {
  createStaff,
  getStaffList,
  updateStaffPermissions
} from '../controllers/pharmacy/staffController.js';

const router = express.Router();

router.use(authenticate);

router.post('/staff', authorize(['pharmacy_owner']), createStaff);
router.get('/staff', authorize(['pharmacy_owner']), getStaffList);
router.put('/staff/:staffId/permissions', authorize(['pharmacy_owner']), updateStaffPermissions);

export default router;