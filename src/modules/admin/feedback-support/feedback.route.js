import express from 'express';
import { verifyUser } from '../../../common/middlewares/verifyUsers.js';
import { getAllMails, changeMailStatus } from './feedback.controller.js';

const router = express.Router();


//---------------------------------------------------------feedbackand support-------------------------------------------------------------\\ 
//get all mails
router.get('/get-all-mails', verifyUser("ADMIN"), getAllMails);
//change mail status 
router.post('/change-mail-status/:id', verifyUser("ADMIN"), changeMailStatus);

export default router;