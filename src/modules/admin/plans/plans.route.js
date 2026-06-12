import express from 'express';
import { verifyUser } from '../../../common/middlewares/verifyUsers.js';
import { createService, getAllServices } from './plans.controller.js';

const router = express.Router();


router.post('/create-service', verifyUser("ADMIN"), createService);
router.get('/get-all-services', getAllServices);

export default router;