import { upload } from '../../config/Multer.config.js';
import { verifyUser } from '../../middlewares/verifyUsers.js';
import express from 'express';
import { addItem ,getAllItems,getItemById} from './add_iteams.controller.js';

const router = express.Router();

router.post('/add-item',verifyUser("USER"),upload.single('img'), addItem);
//get all items
router.get('/get-all-items', verifyUser("USER"), getAllItems);
//get one item by id
router.get('/get-item/:id', verifyUser("USER"), getItemById);
export default router;
