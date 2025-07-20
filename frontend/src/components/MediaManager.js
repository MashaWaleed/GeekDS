import React, { useEffect, useState, useRef } from 'react';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import DeleteIcon from '@mui/icons-material/Delete';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import Box from '@mui/material/Box';
import CircularProgress from '@mui/material/CircularProgress';

function MediaManager() {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef();
  const API_URL = process.env.REACT_APP_API_URL;

  const fetchMedia = () => {
    setLoading(true);
    fetch(`${API_URL}/api/media`)
      .then(res => res.json())
      .then(data => {
        setMedia(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchMedia();
  }, []);

  const handleUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    await fetch(`${API_URL}/api/media`, {
      method: 'POST',
      body: formData,
    });
    setUploading(false);
    fetchMedia();
  };

  const handleDelete = async (id) => {
    await fetch(`${API_URL}/api/media/${id}`, { method: 'DELETE' });
    fetchMedia();
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Media Manager
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button
          variant="contained"
          startIcon={<UploadFileIcon />}
          component="label"
          disabled={uploading}
        >
          {uploading ? <CircularProgress size={20} color="inherit" /> : 'Upload Media'}
          <input
            type="file"
            hidden
            ref={fileInput}
            onChange={handleUpload}
          />
        </Button>
      </Box>
      {loading ? (
        <Typography color="text.secondary">Loading...</Typography>
      ) : media.length === 0 ? (
        <Typography color="text.secondary">No media uploaded.</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Filename</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Uploaded</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {media.map(file => (
                <TableRow key={file.id}>
                  <TableCell>{file.filename}</TableCell>
                  <TableCell>{file.type}</TableCell>
                  <TableCell>{new Date(file.upload_date).toLocaleString()}</TableCell>
                  <TableCell>
                    <IconButton color="error" onClick={() => handleDelete(file.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
}

export default MediaManager; 