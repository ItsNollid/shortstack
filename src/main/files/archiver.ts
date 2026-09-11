import * as fs from 'fs';
import * as path from 'path';
import * as db from '../database';

export const archiveVideo = (videoId: number, archiveDir: string) => {
  const video = db.getVideoById(videoId) as any;
  if (!video) return;

  if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
  }

  const dest = path.join(archiveDir, video.filename);
  
  try {
    fs.renameSync(video.filepath, dest);
    db.updateVideoStatus(videoId, 'archived');
  } catch (e) {
    console.error('Error archiving video:', e);
  }
};
