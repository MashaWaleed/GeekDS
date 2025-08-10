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
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  Avatar,
  Tooltip,
  Switch,
  FormControlLabel
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Computer as ComputerIcon,
  Circle as CircleIcon,
  Send as SendIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon
} from '@mui/icons-material';

function DeviceGrid() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdDevice, setCmdDevice] = useState(null);
  const [command, setCommand] = useState('reboot');
  const [parameters, setParameters] = useState('{}');
  
  // Enhanced UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'table'
  const [autoRefresh, setAutoRefresh] = useState(true);

  const API_URL = process.env.REACT_APP_API_URL;

  const fetchDevices = () => {
    setLoading(true);
    fetch(`${API_URL}/api/devices`)
      .then(res => res.json())
      .then(data => {
        setDevices(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching devices:', error);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchDevices();
    
    // Auto-refresh every 30 seconds if enabled
    let interval;
    if (autoRefresh) {
      interval = setInterval(fetchDevices, 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  // Filter devices based on search and status
  const filteredDevices = devices.filter(device => {
    const matchesSearch = device.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         device.ip.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || device.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate statistics
  const onlineDevices = devices.filter(d => d.status === 'online').length;
  const offlineDevices = devices.filter(d => d.status === 'offline').length;
  const totalDevices = devices.length;

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'online': return 'success';
      case 'offline': return 'error';
      case 'idle': return 'warning';
      default: return 'default';
    }
  };

  const getLastSeenText = (lastPing) => {
    const now = new Date();
    const lastSeen = new Date(lastPing);
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const handleSendCommand = async () => {
    try {
      await fetch(`${API_URL}/api/devices/${cmdDevice}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command, parameters: JSON.parse(parameters) }),
      });
      setCmdOpen(false);
      setCommand('reboot');
      setParameters('{}');
      // Refresh devices after command
      setTimeout(fetchDevices, 2000);
    } catch (error) {
      console.error('Error sending command:', error);
    }
  };

  const renderDeviceCard = (device) => (
    <Grid item xs={12} sm={6} md={4} key={device.id}>
      <Card 
        sx={{ 
          height: '100%',
          border: device.status === 'online' ? '2px solid' : '1px solid',
          borderColor: device.status === 'online' ? 'success.main' : 'divider',
          '&:hover': { 
            boxShadow: 4,
            transform: 'translateY(-2px)',
            transition: 'all 0.2s ease-in-out'
          }
        }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" mb={2}>
            <Avatar 
              sx={{ 
                bgcolor: getStatusColor(device.status) + '.main',
                mr: 2 
              }}
            >
              <ComputerIcon />
            </Avatar>
            <Box flexGrow={1}>
              <Typography variant="h6" noWrap>
                {device.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {device.ip}
              </Typography>
            </Box>
            <Chip
              icon={<CircleIcon sx={{ fontSize: 12 }} />}
              label={device.status}
              color={getStatusColor(device.status)}
              size="small"
            />
          </Box>
          
          <Box mb={2}>
            <Typography variant="body2" color="text.secondary">
              Last seen: {getLastSeenText(device.last_ping)}
            </Typography>
            {device.current_media && (
              <Typography variant="body2" color="text.secondary">
                Playing: {device.current_media}
              </Typography>
            )}
          </Box>

          <Button
            variant="outlined"
            size="small"
            startIcon={<SendIcon />}
            fullWidth
            onClick={() => {
              setCmdDevice(device.id);
              setCmdOpen(true);
            }}
          >
            Send Command
          </Button>
        </CardContent>
      </Card>
    </Grid>
  );

  const renderDeviceTable = () => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Status</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>IP Address</TableCell>
            <TableCell>Last Seen</TableCell>
            <TableCell>Current Media</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredDevices.map(device => (
            <TableRow 
              key={device.id}
              hover
              sx={{
                '& td': { 
                  borderLeft: device.status === 'online' ? '4px solid' : 'none',
                  borderLeftColor: 'success.main'
                }
              }}
            >
              <TableCell>
                <Chip
                  icon={<CircleIcon sx={{ fontSize: 12 }} />}
                  label={device.status}
                  color={getStatusColor(device.status)}
                  size="small"
                />
              </TableCell>
              <TableCell>
                <Box display="flex" alignItems="center">
                  <ComputerIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  {device.name}
                </Box>
              </TableCell>
              <TableCell>{device.ip}</TableCell>
              <TableCell>{getLastSeenText(device.last_ping)}</TableCell>
              <TableCell>
                {device.current_media || <em>None</em>}
              </TableCell>
              <TableCell align="right">
                <Tooltip title="Send Command">
                  <IconButton 
                    color="primary"
                    onClick={() => {
                      setCmdDevice(device.id);
                      setCmdOpen(true);
                    }}
                  >
                    <SendIcon />
                  </IconButton>
                </Tooltip>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );

  return (
    <Box>
      {/* Header with Statistics */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Device Management
        </Typography>
        
        <Grid container spacing={2} alignItems="center" mb={2}>
          <Grid item xs={12} md={6}>
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <Card sx={{ textAlign: 'center', bgcolor: 'success.light', color: 'success.dark' }}>
                  <CardContent sx={{ py: 1 }}>
                    <Typography variant="h4">{onlineDevices}</Typography>
                    <Typography variant="body2">Online</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={4}>
                <Card sx={{ textAlign: 'center', bgcolor: 'error.light', color: 'error.dark' }}>
                  <CardContent sx={{ py: 1 }}>
                    <Typography variant="h4">{offlineDevices}</Typography>
                    <Typography variant="body2">Offline</Typography>
                  </CardContent>
                </Card>
              </Grid>
              <Grid item xs={4}>
                <Card sx={{ textAlign: 'center', bgcolor: 'primary.light', color: 'primary.dark' }}>
                  <CardContent sx={{ py: 1 }}>
                    <Typography variant="h4">{totalDevices}</Typography>
                    <Typography variant="body2">Total</Typography>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Box display="flex" justifyContent="flex-end" alignItems="center" gap={1}>
              <FormControlLabel
                control={
                  <Switch
                    checked={autoRefresh}
                    onChange={(e) => setAutoRefresh(e.target.checked)}
                    size="small"
                  />
                }
                label="Auto-refresh"
              />
              <Tooltip title="Refresh Now">
                <IconButton onClick={fetchDevices} color="primary">
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={viewMode === 'grid' ? 'Switch to Table View' : 'Switch to Grid View'}>
                <IconButton 
                  onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
                  color="primary"
                >
                  {viewMode === 'grid' ? <ViewListIcon /> : <ViewModuleIcon />}
                </IconButton>
              </Tooltip>
            </Box>
          </Grid>
        </Grid>

        {/* Search and Filter Controls */}
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search devices by name or IP..."
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
              <InputLabel>Status Filter</InputLabel>
              <Select
                value={statusFilter}
                label="Status Filter"
                onChange={(e) => setStatusFilter(e.target.value)}
                startAdornment={<FilterIcon sx={{ mr: 1 }} />}
              >
                <MenuItem value="all">All Devices</MenuItem>
                <MenuItem value="online">Online Only</MenuItem>
                <MenuItem value="offline">Offline Only</MenuItem>
                <MenuItem value="idle">Idle Only</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={3}>
            <Typography variant="body2" color="text.secondary">
              Showing {filteredDevices.length} of {totalDevices} devices
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Main Content */}
      <Paper sx={{ p: 2 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <Typography color="text.secondary">Loading devices...</Typography>
          </Box>
        ) : filteredDevices.length === 0 ? (
          <Box textAlign="center" py={4}>
            <ComputerIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {searchTerm || statusFilter !== 'all' ? 'No devices match your filters' : 'No devices registered'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {searchTerm || statusFilter !== 'all' 
                ? 'Try adjusting your search terms or filters' 
                : 'Devices will appear here once they register with the system'
              }
            </Typography>
          </Box>
        ) : viewMode === 'grid' ? (
          <Grid container spacing={2}>
            {filteredDevices.map(renderDeviceCard)}
          </Grid>
        ) : (
          renderDeviceTable()
        )}
      </Paper>

      {/* Command Dialog */}
      <Dialog open={cmdOpen} onClose={() => setCmdOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Send Command to Device</DialogTitle>
        <DialogContent>
          <TextField
            select
            label="Command"
            value={command}
            onChange={e => setCommand(e.target.value)}
            fullWidth
            margin="normal"
            SelectProps={{ native: true }}
          >
            <option value="reboot">Reboot Device</option>
            <option value="shutdown">Shutdown Device</option>
            <option value="play_playlist">Play Playlist</option>
            <option value="stop_playback">Stop Playback</option>
            <option value="sync_content">Sync Content</option>
          </TextField>
          <TextField
            label="Parameters (JSON)"
            value={parameters}
            onChange={e => setParameters(e.target.value)}
            fullWidth
            margin="normal"
            multiline
            rows={3}
            placeholder='{"playlist_id": 1, "volume": 50}'
            helperText="Enter command parameters in JSON format"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCmdOpen(false)}>Cancel</Button>
          <Button onClick={handleSendCommand} variant="contained" color="primary">
            Send Command
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default DeviceGrid; 