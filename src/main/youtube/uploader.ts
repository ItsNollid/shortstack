import { google } from 'googleapis';
import * as fs from 'fs';
import { getAuthenticatedClient } from './auth';

export const uploadVideo = async (queueItem: any): Promise<string> => {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const fileSize = fs.statSync(queueItem.filepath).size;
  
  // Exponential backoff or retry logic could be implemented here
  
  try {
    const res = await youtube.videos.insert({
      part: ['snippet', 'status'],
      notifySubscribers: queueItem.notify_subscribers === 1,
      requestBody: {
        snippet: {
          title: queueItem.title,
          description: queueItem.description,
          tags: queueItem.tags ? JSON.parse(queueItem.tags) : [],
          categoryId: queueItem.category_id,
        },
        status: {
          privacyStatus: queueItem.privacy,
          selfDeclaredMadeForKids: queueItem.made_for_kids === 1,
          publishAt: queueItem.scheduled_for || undefined,
        },
      },
      media: {
        body: fs.createReadStream(queueItem.filepath),
      },
    }, {
      onUploadProgress: evt => {
        // Could emit IPC event for upload progress
        console.log(`Upload progress: ${evt.bytesRead} / ${fileSize}`);
      }
    });

    if (!res.data.id) {
      throw new Error('Upload failed: no video ID returned');
    }

    return res.data.id;
  } catch (error: any) {
    console.error('Upload API Error:', error);
    throw new Error(error.message || 'Upload failed');
  }
};
