import { Router } from 'express';
import devicesRouter from './devices';
import { authenticateToken } from './auth';

const router = Router();

// IMPORTANT: Specific routes MUST come before generic /:id routes to avoid matching conflicts

// Device-facing endpoints (NO AUTH - devices use UUID, not user tokens)
// Registration endpoints
router.post('/register-request', devicesRouter);
router.post('/register-device', devicesRouter);
router.get('/check-registration/:ip', devicesRouter);
router.get('/check-registration/by-uuid/:uuid', devicesRouter);
router.post('/claim', devicesRouter);

// APK download for app updates (NO AUTH - devices need this)
router.get('/apk/latest', devicesRouter);
router.get('/apk/version', devicesRouter);

// Schedule & playlist fetching (devices need this - NO AUTH)
router.get('/:id/schedule', devicesRouter);
router.get('/:id/schedules/all', devicesRouter);

// Commands polling (devices need this - NO AUTH)
router.get('/:id/commands/poll', devicesRouter);

// Screenshot endpoints - device-facing (NO AUTH)
router.post('/:id/screenshot/upload', devicesRouter); // Device uploads screenshot
router.get('/:id/screenshot/latest', devicesRouter); // Get latest screenshot (used by dashboard AND devices)
router.get('/:id/screenshot/status', devicesRouter); // Check if screenshot exists (used by dashboard)

// Heartbeat (NO AUTH)
router.patch('/:id/heartbeat', devicesRouter);
router.patch('/:id', devicesRouter); // Legacy heartbeat

// Clear update flag after successful update (NO AUTH - devices need this)
router.post('/:id/clear-update-flag', devicesRouter);

// Dashboard management endpoints (REQUIRE AUTH)
// These come AFTER specific routes to avoid conflicts
router.post('/enroll', authenticateToken, devicesRouter); // Enroll new device via ADB
router.post('/:id/screenshot', authenticateToken, devicesRouter); // Dashboard requests screenshot from device
router.get('/', authenticateToken, devicesRouter); // List all devices
router.get('/:id', authenticateToken, devicesRouter); // Get single device details
router.put('/:id', authenticateToken, devicesRouter); // Update device
router.delete('/:id', authenticateToken, devicesRouter); // Delete device

export default router;
