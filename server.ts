import express from 'express';
import { createServer as createViteServer } from 'vite';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// AWS S3 Config
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'MISSING',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'MISSING',
  },
});

app.use(cookieParser());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'kavach-secret',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: true, 
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// AWS S3 API Routes
app.get('/api/aws/files', async (req, res) => {
  const { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET_NAME, AWS_REGION } = process.env;
  
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_BUCKET_NAME) {
    const missing = [];
    if (!AWS_ACCESS_KEY_ID) missing.push('AWS_ACCESS_KEY_ID');
    if (!AWS_SECRET_ACCESS_KEY) missing.push('AWS_SECRET_ACCESS_KEY');
    if (!AWS_BUCKET_NAME) missing.push('AWS_BUCKET_NAME');
    
    return res.status(400).json({ 
      error: 'Missing AWS Configuration', 
      details: `The following environment variables are missing: ${missing.join(', ')}. Please add them in Settings > Environment Variables.` 
    });
  }

  console.log(`Attempting to list files in bucket: ${AWS_BUCKET_NAME} (Region: ${AWS_REGION || 'us-east-1'})`);

  try {
    const command = new ListObjectsV2Command({
      Bucket: process.env.AWS_BUCKET_NAME,
    });
    const response = await s3Client.send(command);
    const files = response.Contents?.map(file => ({
      id: file.Key,
      name: file.Key,
      mimeType: 'application/octet-stream', // S3 doesn't always provide this easily
      size: file.Size,
      modifiedTime: file.LastModified,
      source: 'aws'
    })) || [];
    res.json({ files });
  } catch (error: any) {
    console.error('Error listing S3 files:', error);
    res.status(500).json({ 
      error: 'Failed to list AWS S3 files', 
      details: error.message || String(error) 
    });
  }
});

app.get('/api/aws/download/:key', async (req, res) => {
  const { key } = req.params;
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: key,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    res.json({ url });
  } catch (error: any) {
    console.error('Error generating S3 signed URL:', error);
    res.status(500).json({ 
      error: 'Failed to generate download link',
      details: error.message || String(error)
    });
  }
});

// Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Only listen if not running on Vercel
  if (!process.env.VERCEL) {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }
}

startServer();

export default app;
