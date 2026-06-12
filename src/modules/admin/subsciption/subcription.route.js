import express from 'express';

import { verifyUser } from '../../../common/middlewares/verifyUsers.js';

import { getAllsubscriptions, getSubscriptionPdf } from './subscription.controller.js';

const router = express.Router();





//--------------------------------------------------------subscriptions------------------------------------------------------------\\
//get all subscriptions
router.get('/get-all-subscriptions', verifyUser("ADMIN"), getAllsubscriptions);
//get sub pdf
router.get('/get-subscription-pdf', verifyUser("ADMIN"), getSubscriptionPdf);

export default router;