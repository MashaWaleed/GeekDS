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
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import TextField from '@mui/material/TextField';

function DeviceGrid() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdDevice, setCmdDevice] = useState(null);
  const [command, setCommand] = useState('reboot');
  const [parameters, setParameters] = useState('{}');

  const API_URL = process.env.REACT_APP_API_URL;
  console.log('API_URL:', API_URL);

  const fetchDevices = () => {
    setLoading(true);
    fetch(`${API_URL}/api/devices`)
      .then(res => res.json())
      .then(data => {
        setDevices(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleSendCommand = async () => {
    await fetch(`${API_URL}/api/devices/${cmdDevice}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command, parameters: JSON.parse(parameters) }),
    });
    setCmdOpen(false);
    setCommand('reboot');
    setParameters('{}');
  };

  return (
    <Paper sx={{ p: 2, mb: 4 }}>
      <Typography variant="h5" gutterBottom>
        Devices
      </Typography>
      {loading ? (
        <Typography color="text.secondary">Loading...</Typography>
      ) : devices.length === 0 ? (
        <Typography color="text.secondary">No devices registered.</Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>IP</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Ping</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {devices.map(device => (
                <TableRow key={device.id}>
                  <TableCell>{device.name}</TableCell>
                  <TableCell>{device.ip}</TableCell>
                  <TableCell>{device.status}</TableCell>
                  <TableCell>{new Date(device.last_ping).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button size="small" variant="outlined" onClick={() => { setCmdDevice(device.id); setCmdOpen(true); }}>
                      Send Command
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={cmdOpen} onClose={() => setCmdOpen(false)}>
        <DialogTitle>Send Command</DialogTitle>
        <DialogContent>
          <TextField
            select
            label="Command"
            value={command}
            onChange={e => setCommand(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            SelectProps={{ native: true }}
          >
            <option value="reboot">Reboot</option>
            <option value="shutdown">Shutdown</option>
            <option value="play_playlist">Play Playlist</option>
          </TextField>
          <TextField
            label="Parameters (JSON)"
            value={parameters}
            onChange={e => setParameters(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
            placeholder='{"playlist_id":1}'
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCmdOpen(false)}>Cancel</Button>
          <Button onClick={handleSendCommand} variant="contained">Send</Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default DeviceGrid; 