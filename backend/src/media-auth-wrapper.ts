import { Router } from 'express';
import mediaRouter from './media';
import { authenticateToken } from './auth';

const router = Router();

// Media file serving - NO AUTH (devices need to download media files)
// This is for serving media files: GET /api/media/:filename
router.get('/:filename', mediaRouter);

// Dashboard management endpoints - REQUIRE AUTH
router.get('/', authenticateToken, mediaRouter); // List media files
router.post('/', authenticateToken, mediaRouter); // Upload media file
router.delete('/:id', authenticateToken, mediaRouter); // Delete media file

export default router;
