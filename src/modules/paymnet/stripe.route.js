import express from 'express';
import { createPaymentIntent, handleWebhook } from './stripe.controller.js';
import { verifyUser } from '../../common/middlewares/verifyUsers.js';
const router = express.Router();

router.post('/pay', verifyUser("USER"), createPaymentIntent);
router.post("/webhook", handleWebhook);


export default router;
