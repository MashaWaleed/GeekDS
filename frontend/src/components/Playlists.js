import React, { useEffect, useState } from 'react';
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Box,
  Grid,
  Card,
  CardContent,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  ListItemSecondaryAction,
  Breadcrumbs,
  Link,
  InputAdornment,
  Tooltip,
  Menu,
  Divider,
  Avatar,
  FormControlLabel,
  Switch,
  Alert,
  Collapse
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Folder as FolderIcon,
  Home as HomeIcon,
  Search as SearchIcon,
  PlaylistPlay as PlaylistPlayIcon,
  VideoFile as VideoFileIcon,
  AudioFile as AudioFileIcon,
  Image as ImageIcon,
  DragIndicator as DragIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  MoreVert as MoreVertIcon,
  FileCopy as CopyIcon,
  Visibility as PreviewIcon
} from '@mui/icons-material';

function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [media, setMedia] = useState([]);
  const [folders, setFolders] = useState([]);
  const [mediaFolders, setMediaFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [folderDialog, setFolderDialog] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState(null);
  const [editingFolder, setEditingFolder] = useState(null);
  const [name, setName] = useState('');
  const [folderName, setFolderName] = useState('');
  const [selectedMedia, setSelectedMedia] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [mediaSearchTerm, setMediaSearchTerm] = useState('');
  const [selectedMediaFolder, setSelectedMediaFolder] = useState('');
  const [showMediaPreview, setShowMediaPreview] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuItem, setMenuItem] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL;

  const fetchPlaylists = () => {
    setLoading(true);
    Promise.all([
      fetch(`${API_URL}/api/playlists`).then(res => res.json()),
      fetch(`${API_URL}/api/media`).then(res => res.json()),
      fetch(`${API_URL}/api/folders?type=playlist`).then(res => res.json()).catch(() => []),
      fetch(`${API_URL}/api/folders?type=media`).then(res => res.json()).catch(() => [])
    ]).then(([playlistsData, mediaData, foldersData, mediaFoldersData]) => {
      setPlaylists(playlistsData);
      setMedia(mediaData);
      setFolders(foldersData);
      setMediaFolders(mediaFoldersData);
      setLoading(false);
    }).catch(error => {
      console.error('Error fetching data:', error);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchPlaylists();
  }, []);

  // Filter playlists
  const filteredPlaylists = playlists.filter(playlist => {
    const matchesFolder = selectedFolder === '' || 
                         (selectedFolder === 'none' && !playlist.folder_id) ||
                         playlist.folder_id?.toString() === selectedFolder;
    const matchesSearch = playlist.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  // Filter media for selection
  const filteredMedia = media.filter(file => {
    const matchesFolder = selectedMediaFolder === '' || 
                         (selectedMediaFolder === 'none' && !file.folder_id) ||
                         file.folder_id?.toString() === selectedMediaFolder;
    const matchesSearch = file.filename.toLowerCase().includes(mediaSearchTerm.toLowerCase());
    return matchesFolder && matchesSearch;
  });

  const currentFolderData = folders.find(f => f.id?.toString() === selectedFolder);

  const handleCreate = async () => {
    if (!name.trim()) return;
    
    const playlistData = {
      name: name.trim(),
      media_files: selectedMedia
    };

    if (selectedFolder && selectedFolder !== 'none') {
      playlistData.folder_id = parseInt(selectedFolder);
    }
    
    const url = editingPlaylist 
      ? `${API_URL}/api/playlists/${editingPlaylist.id}`
      : `${API_URL}/api/playlists`;
    const method = editingPlaylist ? 'PATCH' : 'POST';
    
    try {
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(playlistData),
      });
      
      handleCloseDialog();
      fetchPlaylists();
    } catch (error) {
      console.error('Error saving playlist:', error);
    }
  };
  
  const handleEdit = async (playlist) => {
    try {
      const response = await fetch(`${API_URL}/api/playlists/${playlist.id}`);
      const playlistData = await response.json();
      
      setEditingPlaylist(playlist);
      setName(playlist.name);
      setSelectedMedia(playlistData.media_files || []);
      setSelectedFolder(playlist.folder_id?.toString() || '');
      setOpen(true);
    } catch (error) {
      console.error('Error fetching playlist details:', error);
    }
  };
  
  const handleCloseDialog = () => {
    setOpen(false);
    setEditingPlaylist(null);
    setName('');
    setSelectedMedia([]);
    setSelectedFolder('');
    setMediaSearchTerm('');
    setSelectedMediaFolder('');
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this playlist?')) {
      try {
        await fetch(`${API_URL}/api/playlists/${id}`, { method: 'DELETE' });
        fetchPlaylists();
      } catch (error) {
        console.error('Error deleting playlist:', error);
      }
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    
    try {
      const response = await fetch(`${API_URL}/api/folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName.trim(),
          type: 'playlist'
        }),
      });
      
      if (response.ok) {
        setFolderDialog(false);
        setFolderName('');
        setEditingFolder(null);
        fetchPlaylists();
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (window.confirm(`Are you sure you want to delete the folder "${folder.name}"?`)) {
      try {
        await fetch(`${API_URL}/api/folders/${folder.id}`, { method: 'DELETE' });
        fetchPlaylists();
        if (selectedFolder === folder.id.toString()) {
          setSelectedFolder('');
        }
      } catch (error) {
        console.error('Error deleting folder:', error);
      }
    }
  };

  const handleMediaToggle = (id) => {
    setSelectedMedia(selectedMedia.includes(id)
      ? selectedMedia.filter(mid => mid !== id)
      : [...selectedMedia, id]);
  };

  const getFileIcon = (type) => {
    if (type?.startsWith('video/')) return <VideoFileIcon />;
    if (type?.startsWith('audio/')) return <AudioFileIcon />;
    if (type?.startsWith('image/')) return <ImageIcon />;
    return <VideoFileIcon />;
  };

  const getPlaylistStats = (playlist) => {
    if (!playlist.media_files) return { count: 0, duration: 0 };
    
    const mediaFiles = playlist.media_files.map(id => 
      media.find(m => m.id === id)
    ).filter(Boolean);
    
    const totalDuration = mediaFiles.reduce((sum, file) => 
      sum + (file.duration || 0), 0
    );
    
    return {
      count: mediaFiles.length,
      duration: totalDuration
    };
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMenuOpen = (event, item) => {
    setMenuAnchor(event.currentTarget);
    setMenuItem(item);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuItem(null);
  };

  const renderPlaylistCard = (playlist) => {
    const stats = getPlaylistStats(playlist);
    
    return (
      <Grid item xs={12} sm={6} md={4} key={playlist.id}>
        <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <CardContent sx={{ flexGrow: 1 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <Avatar sx={{ bgcolor: 'primary.main', mr: 2 }}>
                <PlaylistPlayIcon />
              </Avatar>
              <Box flexGrow={1}>
                <Typography variant="h6" noWrap>
                  {playlist.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {stats.count} files • {formatDuration(stats.duration)}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={(e) => handleMenuOpen(e, playlist)}
              >
                <MoreVertIcon />
              </IconButton>
            </Box>
            
            <Box mb={2}>
              {playlist.folder_id && (
                <Chip
                  icon={<FolderIcon />}
                  label={folders.find(f => f.id === playlist.folder_id)?.name || 'Unknown'}
                  size="small"
                  variant="outlined"
                  sx={{ mb: 1 }}
                />
              )}
              <Typography variant="body2" color="text.secondary">
                Updated: {new Date(playlist.updated_at).toLocaleDateString()}
              </Typography>
            </Box>

            <Box display="flex" gap={1}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<EditIcon />}
                onClick={() => handleEdit(playlist)}
                fullWidth
              >
                Edit
              </Button>
            </Box>
          </CardContent>
        </Card>
      </Grid>
    );
  };

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Playlist Management
        </Typography>
        
        {/* Breadcrumbs */}
        <Breadcrumbs sx={{ mb: 2 }}>
          <Link
            component="button"
            variant="body2"
            onClick={() => setSelectedFolder('')}
            sx={{ display: 'flex', alignItems: 'center' }}
          >
            <HomeIcon sx={{ mr: 0.5, fontSize: 16 }} />
            All Playlists
          </Link>
          {currentFolderData && (
            <Typography color="text.primary" sx={{ display: 'flex', alignItems: 'center' }}>
              <FolderIcon sx={{ mr: 0.5, fontSize: 16 }} />
              {currentFolderData.name}
            </Typography>
          )}
        </Breadcrumbs>

        {/* Controls */}
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search playlists..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          
          <Grid item xs={12} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Folder</InputLabel>
              <Select
                value={selectedFolder}
                label="Folder"
                onChange={(e) => setSelectedFolder(e.target.value)}
              >
                <MenuItem value="">All Folders</MenuItem>
                <MenuItem value="none">No Folder</MenuItem>
                {folders.map(folder => (
                  <MenuItem key={folder.id} value={folder.id.toString()}>
                    <Box display="flex" alignItems="center">
                      <FolderIcon sx={{ mr: 1, fontSize: 16 }} />
                      {folder.name}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={5}>
            <Box display="flex" gap={1} justifyContent="flex-end">
              <Button
                variant="outlined"
                startIcon={<FolderIcon />}
                onClick={() => {
                  setEditingFolder(null);
                  setFolderName('');
                  setFolderDialog(true);
                }}
              >
                New Folder
              </Button>
              
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpen(true)}
              >
                New Playlist
              </Button>
            </Box>
          </Grid>
        </Grid>

        {/* Statistics */}
        <Box mt={2}>
          <Typography variant="body2" color="text.secondary">
            Showing {filteredPlaylists.length} playlists
            {selectedFolder && currentFolderData && ` in "${currentFolderData.name}"`}
            {searchTerm && ` matching "${searchTerm}"`}
          </Typography>
        </Box>
      </Paper>

      {/* Main Content */}
      <Paper sx={{ p: 2 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <Typography color="text.secondary">Loading playlists...</Typography>
          </Box>
        ) : filteredPlaylists.length === 0 ? (
          <Box textAlign="center" py={4}>
            <PlaylistPlayIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {searchTerm || selectedFolder ? 'No playlists found' : 'No playlists created yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {searchTerm || selectedFolder 
                ? 'Try adjusting your search or folder filter' 
                : 'Create your first playlist to get started'
              }
            </Typography>
            {!searchTerm && !selectedFolder && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setOpen(true)}
                sx={{ mt: 2 }}
              >
                Create Playlist
              </Button>
            )}
          </Box>
        ) : (
          <Grid container spacing={2}>
            {filteredPlaylists.map(renderPlaylistCard)}
          </Grid>
        )}
      </Paper>

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={() => {
          handleEdit(menuItem);
          handleMenuClose();
        }}>
          <ListItemIcon>
            <EditIcon />
          </ListItemIcon>
          <ListItemText>Edit Playlist</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          // Duplicate playlist
          setName(menuItem.name + ' (Copy)');
          setSelectedMedia(menuItem.media_files || []);
          setEditingPlaylist(null);
          setOpen(true);
          handleMenuClose();
        }}>
          <ListItemIcon>
            <CopyIcon />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem 
          onClick={() => {
            handleDelete(menuItem.id);
            handleMenuClose();
          }}
          sx={{ color: 'error.main' }}
        >
          <ListItemIcon>
            <DeleteIcon color="error" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      {/* Playlist Dialog */}
      <Dialog open={open} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingPlaylist ? 'Edit Playlist' : 'Create New Playlist'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Playlist Name"
                value={name}
                onChange={e => setName(e.target.value)}
                fullWidth
                margin="normal"
                autoFocus
              />
              
              <FormControl fullWidth margin="normal">
                <InputLabel>Folder (Optional)</InputLabel>
                <Select
                  value={selectedFolder}
                  label="Folder (Optional)"
                  onChange={(e) => setSelectedFolder(e.target.value)}
                >
                  <MenuItem value="">No Folder</MenuItem>
                  {folders.map(folder => (
                    <MenuItem key={folder.id} value={folder.id.toString()}>
                      <Box display="flex" alignItems="center">
                        <FolderIcon sx={{ mr: 1, fontSize: 16 }} />
                        {folder.name}
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {selectedMedia.length > 0 && (
                <Box mt={2}>
                  <Typography variant="subtitle2" gutterBottom>
                    Selected Media ({selectedMedia.length} files)
                  </Typography>
                  <List dense sx={{ maxHeight: 200, overflow: 'auto', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                    {selectedMedia.map(id => {
                      const file = media.find(m => m.id === id);
                      if (!file) return null;
                      return (
                        <ListItem key={id}>
                          <ListItemIcon>
                            {getFileIcon(file.type)}
                          </ListItemIcon>
                          <ListItemText primary={file.filename} />
                          <ListItemSecondaryAction>
                            <IconButton size="small" onClick={() => handleMediaToggle(id)}>
                              <DeleteIcon />
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              )}
            </Grid>

            <Grid item xs={12} md={6}>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle2">
                  Add Media Files
                </Typography>
                <FormControlLabel
                  control={
                    <Switch
                      checked={showMediaPreview}
                      onChange={(e) => setShowMediaPreview(e.target.checked)}
                      size="small"
                    />
                  }
                  label="Preview"
                />
              </Box>

              <Grid container spacing={1} mb={2}>
                <Grid item xs={12}>
                  <TextField
                    size="small"
                    placeholder="Search media..."
                    value={mediaSearchTerm}
                    onChange={(e) => setMediaSearchTerm(e.target.value)}
                    fullWidth
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <SearchIcon />
                        </InputAdornment>
                      ),
                    }}
                  />
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Media Folder</InputLabel>
                    <Select
                      value={selectedMediaFolder}
                      label="Media Folder"
                      onChange={(e) => setSelectedMediaFolder(e.target.value)}
                    >
                      <MenuItem value="">All Folders</MenuItem>
                      <MenuItem value="none">No Folder</MenuItem>
                      {mediaFolders.map(folder => (
                        <MenuItem key={folder.id} value={folder.id.toString()}>
                          <Box display="flex" alignItems="center">
                            <FolderIcon sx={{ mr: 1, fontSize: 16 }} />
                            {folder.name}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>

              <List 
                dense 
                sx={{ 
                  maxHeight: 300, 
                  overflow: 'auto', 
                  border: 1, 
                  borderColor: 'divider', 
                  borderRadius: 1 
                }}
              >
                {filteredMedia.length === 0 ? (
                  <ListItem>
                    <ListItemText 
                      primary="No media files found"
                      secondary="Try adjusting your search or folder filter"
                    />
                  </ListItem>
                ) : (
                  filteredMedia.map(file => (
                    <ListItem 
                      key={file.id}
                      button
                      selected={selectedMedia.includes(file.id)}
                      onClick={() => handleMediaToggle(file.id)}
                    >
                      <ListItemIcon>
                        {getFileIcon(file.type)}
                      </ListItemIcon>
                      <ListItemText 
                        primary={file.filename}
                        secondary={showMediaPreview ? `${file.type} • ${file.duration ? formatDuration(file.duration) : 'Unknown duration'}` : file.type}
                      />
                    </ListItem>
                  ))
                )}
              </List>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button 
            onClick={handleCreate} 
            variant="contained"
            disabled={!name.trim()}
          >
            {editingPlaylist ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Folder Dialog */}
      <Dialog open={folderDialog} onClose={() => setFolderDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            label="Folder Name"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            fullWidth
            margin="normal"
            placeholder="Enter folder name..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFolderDialog(false)}>Cancel</Button>
          <Button 
            onClick={handleCreateFolder}
            variant="contained"
            disabled={!folderName.trim()}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Playlists; 