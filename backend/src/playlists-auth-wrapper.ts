import { Router } from 'express';
import playlistsRouter from './playlists';
import { authenticateToken } from './auth';

const router = Router();

// Device-facing endpoint (NO AUTH - devices need to fetch playlists)
router.get('/:id', playlistsRouter); // Get single playlist (devices need this)

// Dashboard endpoints (REQUIRE AUTH)
router.get('/', authenticateToken, playlistsRouter); // List all playlists
router.post('/', authenticateToken, playlistsRouter); // Create playlist
router.patch('/:id', authenticateToken, playlistsRouter); // Update playlist
router.delete('/:id', authenticateToken, playlistsRouter); // Delete playlist

export default router;
