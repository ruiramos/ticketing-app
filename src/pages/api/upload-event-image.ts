import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs/promises';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { getServerSession } from 'next-auth';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { logger } from '~/server/logger';
import { prisma } from '~/server/prisma';

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

  // Only organization members (who create and edit events) may upload: this
  // was open to anyone, letting them store files in our bucket.
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const user = await prisma.user.findFirst({
    where: { email: session.user.email },
    select: { organizationId: true },
  });
  if (!user?.organizationId) {
    return res.status(403).json({ error: 'Forbidden' });
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
      logger.warn({ err: e }, 'upload: error unlinking temp file');
    }

    // Construct public URL
    const publicUrl = `https://storage.googleapis.com/${bucketName}/${newFilename}`;

    return res.status(200).json({ url: publicUrl });
  } catch (error) {
    logger.error({ err: error }, 'upload: image upload failed');
    return res.status(500).json({ error: 'Upload failed' });
  }
}
