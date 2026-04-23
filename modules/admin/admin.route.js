import express from 'express';

import { upload } from '../../config/Multer.config.js';
import { verifyUser } from '../../middlewares/verifyUsers.js';
import {
    changeAdminPassword,
    getMe,
    updateSettings,
    getGeneralSettings,
    getSubscriptionPdf,
    getAllsubscriptions,
    monthlyRevenue,
    getSubscriptionStats,
    activeSubscription,
    printListPdf,
    createService,
    getAllServices,
    getAllAdmins,
    loginAdmin,
    updateAdminDetails,
    updateImage,
    deleteAdmin,
    inviteAdmin,
    getAllUsers,
    getTotalUsers,
    suspendUser,
    activateUser,
    getAllMails,
    changeMailStatus,
    thisMonthRevenue
} from './admin.controller.js';

const router = express.Router();

//--------------------------------------------------------admin login---------------------------------------------------------\\
router.post('/login', loginAdmin);
//--------------------------------------------------------home page------------------------------------------------------------\\
//get total number of users
router.get('/get-total-users', verifyUser("ADMIN"), getTotalUsers);
//get active subscriptions in the last month
router.get('/get-active-subscriptions-last-month', verifyUser("ADMIN"), activeSubscription)
//monthly revenue
router.get('/get-monthly-revenue', verifyUser("ADMIN"), monthlyRevenue);
//get chart data
router.get('/get-chart-data', verifyUser("ADMIN"), getSubscriptionStats);
//--------------------------------------------------------user management----------------------------------------------------------\\
//get all users
router.get('/get-all-users', verifyUser("ADMIN"), getAllUsers);
//get pdf
router.get('/get-pdf', verifyUser("ADMIN"), printListPdf);
//suspend a user
router.put('/suspend-user/:id', verifyUser("ADMIN"), suspendUser);
//active a user
router.put('/active-user/:id', verifyUser("ADMIN"), activateUser);
//--------------------------------------------------------subscriptions------------------------------------------------------------\\
//get all subscriptions
router.get('/get-all-subscriptions', verifyUser("ADMIN"), getAllsubscriptions);
//get sub pdf
router.get('/get-subscription-pdf', verifyUser("ADMIN"), getSubscriptionPdf);
//---------------------------------------------------------feedbackand support-------------------------------------------------------------\\ 
//get all mails
router.get('/get-all-mails', verifyUser("ADMIN"), getAllMails);
//change mail status 
router.post('/change-mail-status/:id', verifyUser("ADMIN"), changeMailStatus);
//-------------------------------------------------------------settings-----------------------------------------------------------------\\
//general settigns
router.put('/update-general-settings', verifyUser("ADMIN"), updateSettings)
//get general settings
router.get('/get-general-settings', verifyUser("ADMIN"), getGeneralSettings)
//Admin info
//get me
router.get('/get-me', verifyUser("ADMIN"), getMe);
//admin change password
router.post('/change-password', verifyUser("ADMIN"), changeAdminPassword);
//admin profile image upload
router.put('/update-image', upload.single('profilePicture'), verifyUser("ADMIN"), updateImage);
//update admin details
router.put('/update-admin-details', verifyUser("ADMIN"), updateAdminDetails);
//Admins
//get all admins
router.get('/get-all-admins', verifyUser("ADMIN"), getAllAdmins);
//delete a admin
router.delete('/delete-admin/:id', verifyUser("ADMIN"), deleteAdmin);
//invite a new admin
router.post('/invite-admin', verifyUser("ADMIN"), inviteAdmin)
//----------------------------------------------------------------create service----------------------------------------------------------------\\
router.post('/create-service', verifyUser("ADMIN"), createService);
router.get('/get-all-services', getAllServices);
// this month revenue
router.get('/thismonths', verifyUser("ADMIN"),thisMonthRevenue);
export default router;