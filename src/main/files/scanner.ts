import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as db from '../database';

const VALID_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];

export const scanFolder = async (): Promise<number> => {
  const settings = db.getSettings();
  const folderPath = settings.shorts_folder;
  if (!folderPath || !fs.existsSync(folderPath)) return 0;

  const files = fs.readdirSync(folderPath);
  let newVideosCount = 0;

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!VALID_EXTENSIONS.includes(ext)) continue;

    const filepath = path.join(folderPath, file);
    const stat = fs.statSync(filepath);
    if (!stat.isFile()) continue;

    // Compute simple hash (first 1MB + size)
    const fd = fs.openSync(filepath, 'r');
    const buffer = Buffer.alloc(Math.min(stat.size, 1024 * 1024));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    
    const hash = crypto.createHash('md5').update(buffer).update(stat.size.toString()).digest('hex');

    try {
      // Check if exists
      const stmt = db.getDb().prepare('SELECT id FROM videos WHERE file_hash = ?');
      const existing = stmt.get(hash);

      if (!existing) {
        const info = db.insertVideo({
          filename: file,
          filepath,
          file_hash: hash,
          status: 'pending'
        });

        // Auto-create queue entry
        db.insertQueueItem({
          video_id: info.lastInsertRowid,
          title: path.basename(file, ext),
          description: '',
          tags: '',
          category_id: '22',
          privacy: 'public'
        });

        newVideosCount++;
      }
    } catch (e) {
      console.error('Error scanning file:', file, e);
    }
  }

  return newVideosCount;
};
