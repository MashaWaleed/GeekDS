import React, { useEffect, useState, useRef, useDeferredValue } from 'react';
import { FixedSizeList as VirtualList } from 'react-window';
import { api, getAuthToken } from '../utils/api';
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
  Box,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Breadcrumbs,
  Link,
  Tooltip,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
  InputAdornment,
  Alert,
  CircularProgress
} from '@mui/material';
import {
  Delete as DeleteIcon,
  UploadFile as UploadFileIcon,
  Folder as FolderIcon,
  FolderOpen as FolderOpenIcon,
  VideoFile as VideoFileIcon,
  AudioFile as AudioFileIcon,
  Image as ImageIcon,
  Add as AddIcon,
  Search as SearchIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  MoreVert as MoreVertIcon,
  Edit as EditIcon,
  Home as HomeIcon,
  FileDownload as FileDownloadIcon
} from '@mui/icons-material';

function MediaManager() {
  const [media, setMedia] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentFileName, setCurrentFileName] = useState('');
  const [viewMode, setViewMode] = useState('list');
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearch = useDeferredValue(searchTerm);
  const [selectedFolder, setSelectedFolder] = useState('');
  
  // Dialog states
  const [folderDialog, setFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState(null);
  
  // Menu states
  const [menuPosition, setMenuPosition] = useState(null);
  const [menuItem, setMenuItem] = useState(null);
  
  const fileInput = useRef();
  const API_URL = process.env.REACT_APP_API_URL;

  const fetchMedia = () => {
    setLoading(true);
    Promise.all([
      api('/api/media').then(res => res.json()),
      api('/api/folders?type=media').then(res => res.json()).catch(() => []),
      api('/api/folders?type=playlist').then(res => res.json()).catch(() => []) // Fetch playlist folders too for sync
    ]).then(([mediaData, foldersData, playlistFoldersData]) => {
      setMedia(mediaData);
      setFolders(foldersData);
      setLoading(false);
    }).catch(error => {
      console.error('Error fetching data:', error);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  // Filter media based on current folder and deferred search; sort alphabetically
  const filteredMedia = media
    .filter(file => {
      const matchesFolder = selectedFolder === '' || 
                           (selectedFolder === 'none' && !file.folder_id) ||
                           file.folder_id?.toString() === selectedFolder;
      const term = (deferredSearch || '').toLowerCase();
      const matchesSearch = file.filename.toLowerCase().includes(term);
      return matchesFolder && matchesSearch;
    })
    .sort((a, b) => a.filename.localeCompare(b.filename, undefined, { sensitivity: 'base' }));

  const currentFolderData = folders.find(f => f.id?.toString() === selectedFolder);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setUploading(true);
    
    for (const file of files) {
      setCurrentFileName(file.name);
      setUploadProgress(0);
      
      const formData = new FormData();
      formData.append('file', file);
      if (selectedFolder && selectedFolder !== 'none') {
        formData.append('folder_id', selectedFolder);
      }
      
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          // Track upload progress
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(percentComplete);
            }
          });
          
          // Handle completion
          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          });
          
          // Handle errors
          xhr.addEventListener('error', () => {
            reject(new Error('Network error during upload'));
          });
          
          xhr.addEventListener('abort', () => {
            reject(new Error('Upload aborted'));
          });
          
          // Send request with authentication
          xhr.open('POST', `${API_URL}/api/media`);
          
          // Add authentication token
          const token = getAuthToken();
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
          
          xhr.send(formData);
        });
      } catch (error) {
        console.error('Error uploading file:', file.name, error);
      }
    }
    
    setUploading(false);
    setUploadProgress(0);
    setCurrentFileName('');
    fetchMedia();
    // Reset file input
    if (fileInput.current) {
      fileInput.current.value = '';
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this media file?')) {
      try {
        await api(`/api/media/${id}`, { method: 'DELETE' });
        fetchMedia();
      } catch (error) {
        console.error('Error deleting media:', error);
      }
    }
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) return;
    
    try {
      const response = await api('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: folderName.trim(),
          type: 'media',
          parent_id: currentFolder,
          createBoth: true
        }),
      });
      
      if (response.ok) {
        setFolderDialog(false);
        setFolderName('');
        setEditingFolder(null);
        fetchMedia();
      }
    } catch (error) {
      console.error('Error creating folder:', error);
    }
  };

  const handleUpdateFolder = async () => {
    if (!folderName.trim() || !editingFolder) return;
    
    try {
      const response = await api(`/api/folders/${editingFolder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: folderName.trim() }),
      });
      
      if (response.ok) {
        setFolderDialog(false);
        setFolderName('');
        setEditingFolder(null);
        fetchMedia();
      }
    } catch (error) {
      console.error('Error updating folder:', error);
    }
  };

  const handleDeleteFolder = async (folder) => {
    if (window.confirm(`Are you sure you want to delete the folder "${folder.name}"? This will also delete the corresponding folder in Playlists.`)) {
      try {
        await api(`/api/folders/${folder.id}?deleteCorresponding=true`, { method: 'DELETE' });
        fetchMedia();
        if (selectedFolder === folder.id.toString()) {
          setSelectedFolder('');
        }
      } catch (error) {
        console.error('Error deleting folder:', error);
      }
    }
  };

  const getFileIcon = (type) => {
    if (type?.startsWith('video/')) return <VideoFileIcon />;
    if (type?.startsWith('audio/')) return <AudioFileIcon />;
    if (type?.startsWith('image/')) return <ImageIcon />;
    return <VideoFileIcon />;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMenuOpen = (event, item) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuPosition({ top: rect.bottom, left: rect.left });
    setMenuItem(item);
  };

  const handleMenuClose = () => {
    setMenuPosition(null);
    setMenuItem(null);
  };

  const renderMediaCard = (file) => (
    <Grid item xs={12} sm={6} md={4} lg={3} key={file.id}>
      <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardMedia
          sx={{
            height: 140,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: 'grey.100'
          }}
        >
          {getFileIcon(file.type)}
        </CardMedia>
        <CardContent sx={{ flexGrow: 1, pb: 1 }}>
          <Tooltip title={file.filename}>
            <Typography variant="subtitle2" noWrap gutterBottom>
              {file.filename}
            </Typography>
          </Tooltip>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {file.type}
          </Typography>
          {file.duration && (
            <Chip
              label={formatDuration(file.duration)}
              size="small"
              color="primary"
              variant="outlined"
            />
          )}
          <Box display="flex" justifyContent="space-between" alignItems="center" mt={1}>
            <Typography variant="caption" color="text.secondary">
              {new Date(file.upload_date).toLocaleDateString()}
            </Typography>
            <IconButton
              size="small"
              onClick={(e) => handleMenuOpen(e, file)}
            >
              <MoreVertIcon />
            </IconButton>
          </Box>
        </CardContent>
      </Card>
    </Grid>
  );

  return (
    <Box>
      {/* Header */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Media Library
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
            All Media
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
              placeholder="Search media files..."
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
                MenuProps={{
                  PaperProps: {
                    style: { maxHeight: 250 }
                  }
                }}
              >
                <MenuItem value="">All Folders</MenuItem>
                <MenuItem value="none">No Folder</MenuItem>
                {folders.map(folder => (
                  <MenuItem key={folder.id} value={folder.id.toString()}>
                    <Box display="flex" alignItems="center" sx={{ flexGrow: 1 }}>
                      <FolderIcon sx={{ mr: 1, fontSize: 16 }} />
                      <ListItemText primary={folder.name} />
                    </Box>
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteFolder(folder);
                      }}
                      sx={{ mr: -1 }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={5}>
            <Box display="flex" gap={1} justifyContent="flex-end">
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
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
                startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
                component="label"
                disabled={uploading}
              >
                Upload Media
                <input
                  type="file"
                  hidden
                  multiple
                  ref={fileInput}
                  onChange={handleUpload}
                  accept="video/*,audio/*,image/*"
                />
              </Button>

              <Tooltip title={viewMode === 'grid' ? 'Switch to List View' : 'Switch to Grid View'}>
                <IconButton 
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  color="primary"
                >
                  {viewMode === 'grid' ? <ViewListIcon /> : <ViewModuleIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          </Grid>
        </Grid>

        {/* Statistics */}
        <Box mt={2}>
          <Typography variant="body2" color="text.secondary">
            Showing {filteredMedia.length} files
            {selectedFolder && currentFolderData && ` in "${currentFolderData.name}"`}
            {searchTerm && ` matching "${searchTerm}"`}
          </Typography>
        </Box>
      </Paper>

      {/* Main Content */}
      <Paper sx={{ p: 2 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : filteredMedia.length === 0 ? (
          <Box textAlign="center" py={4}>
            <VideoFileIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {searchTerm || selectedFolder ? 'No media files found' : 'No media uploaded yet'}
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {searchTerm || selectedFolder 
                ? 'Try adjusting your search or folder filter' 
                : 'Upload your first media files to get started'
              }
            </Typography>
            {!searchTerm && !selectedFolder && (
              <Button
                variant="contained"
                startIcon={<UploadFileIcon />}
                component="label"
                sx={{ mt: 2 }}
              >
                Upload Media
                <input
                  type="file"
                  hidden
                  multiple
                  onChange={handleUpload}
                  accept="video/*,audio/*,image/*"
                />
              </Button>
            )}
          </Box>
        ) : viewMode === 'grid' ? (
          <Grid container spacing={2}>
            {filteredMedia.map(renderMediaCard)}
          </Grid>
        ) : (
          <TableContainer>
            <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: '40%', maxWidth: '40%' }}>File</TableCell>
                  <TableCell sx={{ width: '15%', maxWidth: '15%' }}>Type</TableCell>
                  <TableCell sx={{ width: 100 }}>Duration</TableCell>
                  <TableCell sx={{ width: '20%', maxWidth: '20%' }}>Folder</TableCell>
                  <TableCell sx={{ width: 140 }}>Uploaded</TableCell>
                  <TableCell align="right" sx={{ width: 120 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
            </Table>
            <VirtualList
              height={480}
              itemSize={56}
              itemCount={filteredMedia.length}
              width={'100%'}
              style={{ overflowX: 'hidden' }}
            >
              {({ index, style }) => {
                const file = filteredMedia[index];
                return (
                  <div style={style}>
                    <Table size="small" sx={{ tableLayout: 'fixed', width: '100%' }}>
                      <TableBody>
                        <TableRow key={file.id} hover>
                          <TableCell sx={{ width: '40%', maxWidth: '40%' }}>
                            <Box display="flex" alignItems="center" sx={{ overflow: 'hidden' }}>
                              {getFileIcon(file.type)}
                              <Tooltip title={file.filename} placement="top">
                                <Typography variant="body2" noWrap sx={{ ml: 1 }}>
                                  {file.filename}
                                </Typography>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ width: '15%', maxWidth: '15%' }}>
                            <Tooltip title={file.type} placement="top">
                              <Typography variant="body2" noWrap>
                                {file.type}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ width: 100 }}>
                            {file.duration ? formatDuration(file.duration) : '-'}
                          </TableCell>
                          <TableCell sx={{ width: '20%', maxWidth: '20%' }}>
                            <Tooltip title={file.folder_id ? folders.find(f => f.id === file.folder_id)?.name || 'Unknown' : '-'} placement="top">
                              <Typography variant="body2" noWrap>
                                {file.folder_id ? 
                                  folders.find(f => f.id === file.folder_id)?.name || 'Unknown' : 
                                  '-'
                                }
                              </Typography>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ width: 140 }}>{new Date(file.upload_date).toLocaleDateString()}</TableCell>
                          <TableCell align="right" sx={{ width: 120 }}>
                            <IconButton
                              size="small"
                              onClick={(e) => handleMenuOpen(e, file)}
                            >
                              <MoreVertIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                );
              }}
            </VirtualList>
          </TableContainer>
        )}
      </Paper>

      {/* Context Menu */}
      <Menu
        open={Boolean(menuPosition)}
        onClose={handleMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={menuPosition}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
      >
        <MenuItem onClick={() => {
          // Download file
          window.open(`${API_URL}/api/media/${menuItem?.filename}`, '_blank');
          handleMenuClose();
        }}>
          <ListItemIcon>
            <FileDownloadIcon />
          </ListItemIcon>
          <ListItemText>Download</ListItemText>
        </MenuItem>
        <Divider />
        <MenuItem 
          onClick={() => {
            handleDelete(menuItem?.id);
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

      {/* Folder Dialog */}
      <Dialog open={folderDialog} onClose={() => setFolderDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingFolder ? 'Edit Folder' : 'Create New Folder'}
        </DialogTitle>
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
            onClick={editingFolder ? handleUpdateFolder : handleCreateFolder}
            variant="contained"
            disabled={!folderName.trim()}
          >
            {editingFolder ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Progress Dialog */}
      <Dialog 
        open={uploading} 
        maxWidth="sm" 
        fullWidth
        disableEscapeKeyDown
      >
        <DialogTitle>Uploading Media</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', py: 3 }}>
            <Typography variant="body1" gutterBottom>
              {currentFileName}
            </Typography>
            <Box sx={{ position: 'relative', display: 'inline-flex', my: 3 }}>
              <CircularProgress 
                variant="determinate" 
                value={uploadProgress} 
                size={80}
                thickness={4}
              />
              <Box
                sx={{
                  top: 0,
                  left: 0,
                  bottom: 0,
                  right: 0,
                  position: 'absolute',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Typography variant="h6" component="div" color="text.secondary">
                  {`${uploadProgress}%`}
                </Typography>
              </Box>
            </Box>
            <Typography variant="body2" color="text.secondary">
              Please wait while the file is being uploaded...
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

export default MediaManager;