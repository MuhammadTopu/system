import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDir = path.join(__dirname, '../uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// extension by image type; the client's own file name is never used for it
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif' };

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);  
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4(); 
    const ext = EXT_BY_MIME[file.mimetype] || '';
    cb(null, `${uniqueSuffix}${ext}`); 
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, 
  fileFilter: (req, file, cb) => {
    if (!EXT_BY_MIME[file.mimetype]) {
      return cb(new Error('Invalid file type'), false);  
    }
    cb(null, true); 
  }
});

export { upload };
