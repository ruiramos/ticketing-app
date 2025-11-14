import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'events');

    // Ensure the upload directory exists
    await fs.mkdir(uploadDir, { recursive: true });

    const form = formidable({
      uploadDir,
      keepExtensions: true,
      maxFileSize: 5 * 1024 * 1024, // 5MB
      filter: ({ mimetype }) => {
        // Only allow images
        return mimetype?.startsWith('image/') ?? false;
      },
    });

    const [fields, files] = await form.parse(req);

    const file = files.image?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Rename the file to have a cleaner name
    const timestamp = Date.now();
    const originalName = file.originalFilename || 'upload';
    const ext = path.extname(originalName);
    const newFilename = `event-${timestamp}${ext}`;
    const newPath = path.join(uploadDir, newFilename);

    await fs.rename(file.filepath, newPath);

    // Return the public URL
    const publicUrl = `/uploads/events/${newFilename}`;

    return res.status(200).json({ url: publicUrl });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Upload failed' });
  }
}
