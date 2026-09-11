import { google } from 'googleapis';
import { app, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as http from 'http';
import * as url from 'url';

const CREDENTIALS_DIR = path.join(app.getPath('userData'), 'credentials');
const CLIENT_SECRET_PATH = path.join(CREDENTIALS_DIR, 'client_secret.json');
const TOKENS_PATH = path.join(CREDENTIALS_DIR, 'tokens.json');

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'];

export const startOAuth = async (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(CLIENT_SECRET_PATH)) {
      return reject(new Error('Client secret not found'));
    }
    
    const creds = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf-8'));
    const { client_secret, client_id, redirect_uris } = creds.installed || creds.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:8910');

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });

    const server = http.createServer(async (req, res) => {
      try {
        if (req.url && req.url.indexOf('/') > -1) {
          const qs = new url.URL(req.url, 'http://localhost:8910').searchParams;
          const code = qs.get('code');
          if (code) {
            res.end('Authentication successful! Please return to ShortStack.');
            server.close();
            const { tokens } = await oAuth2Client.getToken(code);
            if (!fs.existsSync(CREDENTIALS_DIR)) fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
            fs.writeFileSync(TOKENS_PATH, JSON.stringify(tokens));
            resolve();
          }
        }
      } catch (e) {
        reject(e);
      }
    });

    server.on('error', (err) => {
      reject(err);
    });

    server.listen(8910, () => {
      try {
        shell.openExternal(authUrl);
      } catch (err) {
        reject(err);
      }
    });
  });
};

export const loadTokens = async () => {
  if (!fs.existsSync(TOKENS_PATH)) return null;
  const tokens = JSON.parse(fs.readFileSync(TOKENS_PATH, 'utf-8'));
  return tokens;
};

export const getAuthenticatedClient = async () => {
  if (!fs.existsSync(CLIENT_SECRET_PATH)) throw new Error('No client secret');
  const creds = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, 'utf-8'));
  const { client_secret, client_id } = creds.installed || creds.web;
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, 'http://localhost:8910');
  
  const tokens = await loadTokens();
  if (tokens) oAuth2Client.setCredentials(tokens);
  
  return oAuth2Client;
};

export const getAuthStatus = async () => {
  try {
    const tokens = await loadTokens();
    if (!tokens) return { authenticated: false };
    
    // Validate by attempting to create a client
    const client = await getAuthenticatedClient();
    const youtube = google.youtube({ version: 'v3', auth: client });
    
    // Try to fetch channel info
    const response = await youtube.channels.list({ part: ['snippet'], mine: true });
    const channelName = response.data.items?.[0]?.snippet?.title;
    
    return { authenticated: true, channelName };
  } catch (error) {
    return { authenticated: false };
  }
};
