import * as cron from 'node-cron';
import * as db from './database';
import { uploadVideo } from './youtube/uploader';
import { sendNotification } from './notifications';

let currentTask: cron.ScheduledTask | null = null;
let isPaused = false;

export const startScheduler = () => {
  if (currentTask) currentTask.stop();
  isPaused = false;

  const scheduleExp = db.getSetting('schedule_cron') || '0 * * * *'; // default hourly

  currentTask = cron.schedule(scheduleExp, async () => {
    if (isPaused) return;

    try {
      const dbInstance = db.getDb();
      const stmt = dbInstance.prepare('SELECT * FROM queue WHERE approved = 1 AND (scheduled_for IS NULL OR scheduled_for <= ?) ORDER BY scheduled_for ASC LIMIT 1');
      const item = stmt.get(new Date().toISOString()) as any;

      if (item) {
        const video = db.getVideoById(item.video_id) as any;
        const uploadQueueItem = { ...item, filepath: video.filepath };
        
        const videoId = await uploadVideo(uploadQueueItem);
        
        db.insertUpload({
          queue_id: item.id,
          youtube_video_id: videoId,
          uploaded_at: new Date().toISOString(),
          status: 'success'
        });

        db.updateVideoStatus(video.id, 'uploaded');
        sendNotification('Upload Successful', `Video ${item.title} uploaded successfully!`);
      }
    } catch (e) {
      console.error('Upload failed', e);
      sendNotification('Upload Failed', `Upload failed: ${e}`);
    }
  });

  currentTask.start();
};

export const stopScheduler = () => {
  if (currentTask) {
    currentTask.stop();
  }
  isPaused = true;
};

export const pause = () => {
  isPaused = true;
  db.setSetting('scheduler_paused', 'true');
};

export const resume = () => {
  isPaused = false;
  db.setSetting('scheduler_paused', 'false');
};

export const loadSchedulerState = () => {
  const savedState = db.getSetting('scheduler_paused');
  // Default to paused if they want it to not auto-fire randomly on boot
  if (savedState === 'true' || savedState === undefined) {
    isPaused = true;
  } else {
    isPaused = false;
  }
};

export const getStatus = () => {
  return {
    paused: isPaused,
    nextUpload: null,
    uploadsToday: 0,
    totalScheduled: 0
  };
};
