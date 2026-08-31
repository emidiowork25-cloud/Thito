import { Router, Response } from 'express';
import multer from 'multer';
import { v4 as uuid } from 'uuid';
import { verifyToken, requireStore, AuthRequest } from '../middleware/auth';

const router = Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req: any, file: any, cb: any) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

router.post('/image', verifyToken, requireStore, upload.single('image'), async (req: any, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: { message: 'No image file provided' } });
    }

    const fileId = uuid();
    const fileExtension = req.file.originalname.split('.').pop();
    const fileName = `${fileId}.${fileExtension}`;

    // For now, return a placeholder URL with the filename
    // In production, upload to S3, Cloudinary, or similar
    const imageUrl = `/uploads/${fileName}`;

    // If needed, here's where you'd upload to cloud storage:
    // const s3 = new AWS.S3();
    // await s3.upload({ Bucket, Key: fileName, Body: req.file.buffer }).promise();

    res.json({ imageUrl, fileName });
  } catch (error: any) {
    res.status(500).json({ error: { message: error.message || 'Failed to upload image' } });
  }
});

export default router;
