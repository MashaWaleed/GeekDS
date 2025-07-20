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
import MenuItem from '@mui/material/MenuItem';
import Box from '@mui/material/Box';

function Schedules() {
  const [schedules, setSchedules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [repeat, setRepeat] = useState('');

  const API_URL = process.env.REACT_APP_API_URL;

  const fetchSchedules = () => {
    setLoading(true);
    fetch(`${API_URL}/api/schedules`)
      .then(res => res.json())
      .then(data => {
        setSchedules(data);
        setLoading(false);
      });
  };
  const fetchDevices = () => {
    fetch(`${API_URL}/api/devices`)
      .then(res => res.json())
      .then(data => setDevices(data));
  };
  const fetchPlaylists = () => {
    fetch(`${API_URL}/api/playlists`)
      .then(res => res.json())
      .then(data => setPlaylists(data));
  };

  useEffect(() => {
    fetchSchedules();
    fetchDevices();
    fetchPlaylists();
  }, []);

  const handleCreate = async () => {
    await fetch(`${API_URL}/api/schedules`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        playlist_id: playlistId,
        start_time: startTime,
        end_time: endTime,
        repeat,
      }),
    });
    setOpen(false);
    setDeviceId('');
    setPlaylistId('');
    setStartTime('');
    setEndTime('');
    setRepeat('');
    fetchSchedules();
  };

  const handleDelete = async (id) => {
    await fetch(`${API_URL}/api/schedules/${id}`, { method: 'DELETE' });
    fetchSchedules();
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Schedules
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
          New Schedule
        </Button>
      </Box>
      {loading ? (
        <Typography color="text.secondary">Loading...</Typography>
      ) : schedules.length === 0 ? (
        <Typography color="text.secondary">No schedules created.</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Device</TableCell>
                <TableCell>Playlist</TableCell>
                <TableCell>Start</TableCell>
                <TableCell>End</TableCell>
                <TableCell>Repeat</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {schedules.map(sch => (
                <TableRow key={sch.id}>
                  <TableCell>{devices.find(d => d.id === sch.device_id)?.name || sch.device_id}</TableCell>
                  <TableCell>{playlists.find(p => p.id === sch.playlist_id)?.name || sch.playlist_id}</TableCell>
                  <TableCell>{new Date(sch.start_time).toLocaleString()}</TableCell>
                  <TableCell>{new Date(sch.end_time).toLocaleString()}</TableCell>
                  <TableCell>{sch.repeat}</TableCell>
                  <TableCell>
                    <IconButton color="error" onClick={() => handleDelete(sch.id)}>
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
        <DialogTitle>New Schedule</DialogTitle>
        <DialogContent>
          <TextField
            select
            label="Device"
            value={deviceId}
            onChange={e => setDeviceId(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          >
            {devices.map(d => (
              <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Playlist"
            value={playlistId}
            onChange={e => setPlaylistId(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          >
            {playlists.map(p => (
              <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
            ))}
          </TextField>
          <TextField
            label="Start Time"
            type="datetime-local"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="End Time"
            type="datetime-local"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            label="Repeat"
            value={repeat}
            onChange={e => setRepeat(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            placeholder="e.g. daily, weekly, none"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleCreate} variant="contained">Create</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default Schedules; 