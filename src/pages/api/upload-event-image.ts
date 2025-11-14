import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';

export const config = {
  api: {
    bodyParser: false,
  },
};

const storage = new Storage({
  projectId: 'ticketing-app-460921',
  credentials: process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    ? JSON.parse(atob(process.env.GOOGLE_SERVICE_ACCOUNT_KEY))
    : undefined,
});
const bucketName = 'ticketing-app-event-images';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      filter: ({ mimetype }) => {
        // Only allow images
        return mimetype?.startsWith('image/') ?? false;
      },
    });

    const [_, files] = await form.parse(req);

    const file = files.image?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Generate a cleaner filename
    const timestamp = Date.now();
    const originalName = file.originalFilename || 'upload';
    const ext = path.extname(originalName);
    const newFilename = `event-${timestamp}${ext}`;

    // Upload to GCS
    await storage.bucket(bucketName).upload(file.filepath, {
      destination: newFilename,
      metadata: {
        contentType: file.mimetype || 'image/jpeg',
      },
    });

    // Clean up local temp file
    try {
      await fs.unlink(file.filepath);
    } catch (e) {
      console.error('Error unlinking file', e);
    }

    // Construct public URL
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${newFilename}`;

    return res.status(200).json({ url: publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
