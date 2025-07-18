import React, { useEffect, useState } from 'react';
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
import AddIcon from '@mui/icons-material/Add';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Box from '@mui/material/Box';

function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [selectedMedia, setSelectedMedia] = useState([]);

  const fetchPlaylists = () => {
    setLoading(true);
    fetch('http://localhost:5000/api/playlists')
      .then(res => res.json())
      .then(data => {
        setPlaylists(data);
        setLoading(false);
      });
  };
  const fetchMedia = () => {
    fetch('http://localhost:5000/api/media')
      .then(res => res.json())
      .then(data => setMedia(data));
  };

  useEffect(() => {
    fetchPlaylists();
    fetchMedia();
  }, []);

  const handleCreate = async () => {
    await fetch('http://localhost:5000/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, media_files: selectedMedia }),
    });
    setOpen(false);
    setName('');
    setSelectedMedia([]);
    fetchPlaylists();
  };

  const handleDelete = async (id) => {
    await fetch(`http://localhost:5000/api/playlists/${id}`, { method: 'DELETE' });
    fetchPlaylists();
  };

  const handleMediaToggle = (id) => {
    setSelectedMedia(selectedMedia.includes(id)
      ? selectedMedia.filter(mid => mid !== id)
      : [...selectedMedia, id]);
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Playlists
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          New Playlist
        </Button>
      </Box>
      {loading ? (
        <Typography color="text.secondary">Loading...</Typography>
      ) : playlists.length === 0 ? (
        <Typography color="text.secondary">No playlists created.</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {playlists.map(pl => (
                <TableRow key={pl.id}>
                  <TableCell>{pl.name}</TableCell>
                  <TableCell>
                    <IconButton color="error" onClick={() => handleDelete(pl.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={open} onClose={() => setOpen(false)}>
        <DialogTitle>New Playlist</DialogTitle>
        <DialogContent>
          <TextField
            label="Playlist Name"
            value={name}
            onChange={e => setName(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />
          <Typography variant="subtitle1">Select Media</Typography>
          {media.map(m => (
            <FormControlLabel
              key={m.id}
              control={
                <Checkbox
                  checked={selectedMedia.includes(m.id)}
                  onChange={() => handleMediaToggle(m.id)}
                />
              }
              label={m.filename}
            />
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default Playlists; 