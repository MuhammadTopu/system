import fs from 'fs';
import path from 'path';

export default class FileService {
  deleteFile(filename) {
    if (!filename) return;

    // Try project-level public/uploads then src/uploads
    const candidates = [
      path.join(process.cwd(), 'public', 'uploads', filename),
      path.join(process.cwd(), 'src', 'uploads', filename),
      path.join(process.cwd(), 'uploads', filename),
    ];

    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          fs.unlinkSync(p);
          return true;
        }
      } catch (e) {
        // ignore errors
      }
    }

    return false;
  }
}
