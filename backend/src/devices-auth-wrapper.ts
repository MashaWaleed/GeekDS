import { Router } from 'express';
import devicesRouter from './devices';
import { authenticateToken } from './auth';

const router = Router();

// IMPORTANT: Most specific routes MUST come first to avoid matching conflicts

// Device-facing endpoints (NO AUTH)
router.post('/register-request', devicesRouter);
router.post('/register-device', devicesRouter);
router.get('/check-registration/by-uuid/:uuid', devicesRouter);
router.get('/check-registration/:ip', devicesRouter);
router.post('/claim', devicesRouter);
router.get('/apk/latest', devicesRouter);
router.get('/apk/version', devicesRouter);

// Dashboard authenticated endpoints - MUST come before less specific device routes
router.post('/enroll', authenticateToken, devicesRouter);
router.post('/:id/screenshot', authenticateToken, devicesRouter); // Server-side ffmpeg screenshot
router.get('/', authenticateToken, devicesRouter);
router.put('/:id', authenticateToken, devicesRouter);
router.delete('/:id', authenticateToken, devicesRouter);

// Device-facing specific /:id/* routes (NO AUTH) - AFTER authenticated routes
router.get('/:id/schedule', devicesRouter);
router.get('/:id/schedules/all', devicesRouter);
router.get('/:id/commands/poll', devicesRouter);
router.post('/:id/screenshot/upload', devicesRouter); // Device uploads
router.get('/:id/screenshot/latest', devicesRouter);
router.get('/:id/screenshot/status', devicesRouter);
router.patch('/:id/heartbeat', devicesRouter);
router.post('/:id/clear-update-flag', devicesRouter);
router.patch('/:id', devicesRouter); // Legacy heartbeat

// Generic /:id MUST be last
router.get('/:id', authenticateToken, devicesRouter);

export default router;
