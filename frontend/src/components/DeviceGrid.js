import React, { useEffect, useMemo, useState, useTransition, useDeferredValue } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FixedSizeList as List } from 'react-window';
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
  FormControlLabel,
  Alert,
  Snackbar,
  Fab
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Refresh as RefreshIcon,
  Computer as ComputerIcon,
  Circle as CircleIcon,
  Send as SendIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  QrCode as QrCodeIcon,
  CameraAlt as CameraIcon
} from '@mui/icons-material';

// Add CSS for loading animation
const style = document.createElement('style');
style.textContent = `
  @keyframes loading {
    0% { transform: translateX(-100%); }
    50% { transform: translateX(0%); }
    100% { transform: translateX(100%); }
  }
`;
document.head.appendChild(style);

function DeviceGrid() {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdDevice, setCmdDevice] = useState(null);
  const [command, setCommand] = useState('reboot');
  const [parameters, setParameters] = useState('{}');
  
  // Enhanced UI state
  // Search state (transitioned for responsiveness)
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState('all');
  const [viewMode, setViewMode] = useState('table'); // make 'table' the default
  const [autoRefresh, setAutoRefresh] = useState(false);

  // New registration and management state
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [registrationCode, setRegistrationCode] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [editDevice, setEditDevice] = useState(null);
  const [deviceToDelete, setDeviceToDelete] = useState(null);
  const [snackbar, setSnackbar] = useState({ open: false, message: '', severity: 'info' });

  // NEW: Screenshot state
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [screenshotDevice, setScreenshotDevice] = useState(null);
  const [screenshotUrl, setScreenshotUrl] = useState(null);
  const [screenshotLoading, setScreenshotLoading] = useState(false);

  const API_URL = process.env.REACT_APP_API_URL;

  // Devices query with client-side cache and background refresh
  const { data: devices = [], isFetching, refetch } = useQuery({
    queryKey: ['devices'],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/devices`);
      if (!res.ok) throw new Error('Failed to load devices');
      return res.json();
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Removed debounce: useTransition schedules updates without blocking typing

  const fetchDevices = () => {
    setLoading(true);
    refetch().finally(() => setLoading(false));
  };

  // NEW: Device registration handler
  const handleRegisterDevice = async () => {
    if (!registrationCode.trim() || !deviceName.trim()) {
      setSnackbar({ open: true, message: 'Both registration code and device name are required', severity: 'error' });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/devices/register-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: registrationCode.trim(),
          name: deviceName.trim()
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setSnackbar({ open: true, message: 'Device registered successfully!', severity: 'success' });
        setRegisterOpen(false);
        setRegistrationCode('');
        setDeviceName('');
        await queryClient.invalidateQueries({ queryKey: ['devices'] });
      } else {
        setSnackbar({ open: true, message: data.error || 'Registration failed', severity: 'error' });
      }
    } catch (error) {
      console.error('Error registering device:', error);
      setSnackbar({ open: true, message: 'Network error during registration', severity: 'error' });
    }
  };

  // NEW: Device editing handler
  const handleEditDevice = async () => {
    if (!editDevice || !editDevice.name.trim()) {
      setSnackbar({ open: true, message: 'Device name is required', severity: 'error' });
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/devices/${editDevice.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: editDevice.name.trim(),
          ip: editDevice.ip
        }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setSnackbar({ open: true, message: 'Device updated successfully!', severity: 'success' });
        setEditOpen(false);
        setEditDevice(null);
        await queryClient.invalidateQueries({ queryKey: ['devices'] });
      } else {
        setSnackbar({ open: true, message: data.error || 'Update failed', severity: 'error' });
      }
    } catch (error) {
      console.error('Error updating device:', error);
      setSnackbar({ open: true, message: 'Network error during update', severity: 'error' });
    }
  };

  // NEW: Device deletion handler
  const handleDeleteDevice = async () => {
    if (!deviceToDelete) return;

    try {
      const response = await fetch(`${API_URL}/api/devices/${deviceToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (response.ok) {
        setSnackbar({ open: true, message: 'Device deleted successfully!', severity: 'success' });
        setDeleteOpen(false);
        setDeviceToDelete(null);
        await queryClient.invalidateQueries({ queryKey: ['devices'] });
      } else {
        setSnackbar({ open: true, message: data.error || 'Deletion failed', severity: 'error' });
      }
    } catch (error) {
      console.error('Error deleting device:', error);
      setSnackbar({ open: true, message: 'Network error during deletion', severity: 'error' });
    }
  };

  // NEW: Screenshot handlers
  const handleTakeScreenshot = async (device) => {
    if (device.status !== 'online') {
      setSnackbar({ open: true, message: 'Device must be online to take screenshot', severity: 'error' });
      return;
    }

    setScreenshotDevice(device);
    setScreenshotOpen(true);
    setScreenshotLoading(true);
    setScreenshotUrl(null);

    try {
      // Request screenshot from device
      const response = await fetch(`${API_URL}/api/devices/${device.id}/screenshot`, {
        method: 'POST',
      });

      const data = await response.json();
      
      if (response.ok) {
        setSnackbar({ open: true, message: 'Screenshot request sent to device...', severity: 'info' });
        // Start polling for screenshot
        pollForScreenshot(device.id);
      } else {
        setSnackbar({ open: true, message: data.error || 'Failed to request screenshot', severity: 'error' });
        setScreenshotLoading(false);
      }
    } catch (error) {
      console.error('Error requesting screenshot:', error);
      setSnackbar({ open: true, message: 'Network error during screenshot request', severity: 'error' });
      setScreenshotLoading(false);
    }
  };

  // Poll for screenshot availability
  const pollForScreenshot = (deviceId) => {
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/devices/${deviceId}/screenshot/status`);
        const data = await response.json();
        
        if (response.ok && data.available) {
          // Screenshot is ready, get it
          setScreenshotUrl(`${API_URL}/api/devices/${deviceId}/screenshot/latest?t=${Date.now()}`);
          setScreenshotLoading(false);
          clearInterval(pollInterval);
        }
      } catch (error) {
        console.error('Error polling for screenshot:', error);
      }
    }, 2000); // Poll every 2 seconds

    // Stop polling after 30 seconds
    setTimeout(() => {
      clearInterval(pollInterval);
      if (screenshotLoading) {
        setScreenshotLoading(false);
        setSnackbar({ open: true, message: 'Screenshot request timed out', severity: 'warning' });
      }
    }, 30000);
  };

  useEffect(() => {
    fetchDevices();
    
    // Auto-refresh every 30 seconds if enabled
    let interval;
    if (autoRefresh) {
      interval = setInterval(() => refetch(), 30000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh, refetch]);

  // Filter devices based on search and status (memoized), with deferred search term to avoid blocking
  const deferredTerm = useDeferredValue(searchTerm);
  const filteredDevices = useMemo(() => {
    const term = (deferredTerm || '').toLowerCase();
    const result = devices.filter(device => {
      const matchesSearch = device.name.toLowerCase().includes(term) ||
                           device.ip.includes(deferredTerm || '');
      const matchesStatus = statusFilter === 'all' || device.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
    // Sort alphabetically by name for consistent ordering
    result.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return result;
  }, [devices, deferredTerm, statusFilter]);

  // Calculate statistics (memoized)
  const { onlineDevices, offlineDevices, totalDevices } = useMemo(() => {
    let online = 0, offline = 0;
    for (const d of devices) {
      if (d.status === 'online') online++; else if (d.status === 'offline') offline++;
    }
    return { onlineDevices: online, offlineDevices: offline, totalDevices: devices.length };
  }, [devices]);

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
    <Grid item xs={12} sm={6} md={6} lg={4} key={device.id}>
      <Card 
        sx={{ 
          height: '100%',
          minHeight: 250,
          border: device.status === 'online' ? '2px solid' : '1px solid',
          borderColor: device.status === 'online' ? 'success.main' : 'divider',
          '&:hover': { 
            boxShadow: 4,
            transform: 'translateY(-2px)',
            transition: 'all 0.2s ease-in-out'
          }
        }}
      >
        <CardContent sx={{ p: 3 }}>
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

          <Box display="flex" gap={1} mb={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<SendIcon />}
              onClick={() => {
                setCmdDevice(device.id);
                setCmdOpen(true);
              }}
              sx={{ flex: 1 }}
            >
              Command
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<CameraIcon />}
              onClick={() => handleTakeScreenshot(device)}
              disabled={device.status !== 'online'}
              sx={{ flex: 1 }}
            >
              Screenshot
            </Button>
          </Box>
          
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<EditIcon />}
              onClick={() => {
                setEditDevice({ ...device });
                setEditOpen(true);
              }}
              sx={{ flex: 1 }}
            >
              Edit
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              startIcon={<DeleteIcon />}
              onClick={() => {
                setDeviceToDelete(device);
                setDeleteOpen(true);
              }}
              sx={{ flex: 1 }}
            >
              Delete
            </Button>
          </Box>
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
              <TableCell sx={{ width: 140 }}>
                <Chip
                  icon={<CircleIcon sx={{ fontSize: 12 }} />}
                  label={device.status}
                  color={getStatusColor(device.status)}
                  size="small"
                />
              </TableCell>
              <TableCell sx={{ width: '28%' }}>
                <Box display="flex" alignItems="center">
                  <ComputerIcon sx={{ mr: 1, color: 'text.secondary' }} />
                  {device.name}
                </Box>
              </TableCell>
              <TableCell sx={{ width: '20%' }}>{device.ip}</TableCell>
              <TableCell sx={{ width: 140 }}>{getLastSeenText(device.last_ping)}</TableCell>
              <TableCell>
                {device.current_media || <em>None</em>}
              </TableCell>
              <TableCell align="right" sx={{ width: 180 }}>
                <Tooltip title="Send Command">
                  <IconButton 
                    color="primary"
                    onClick={() => {
                      setCmdDevice(device.id);
                      setCmdOpen(true);
                    }}
                    size="small"
                  >
                    <SendIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Edit Device">
                  <IconButton
                    onClick={() => {
                      setEditDevice({ ...device });
                      setEditOpen(true);
                    }}
                    size="small"
                    sx={{ ml: 0.5 }}
                  >
                    <EditIcon />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Delete Device">
                  <IconButton
                    color="error"
                    onClick={() => {
                      setDeviceToDelete(device);
                      setDeleteOpen(true);
                    }}
                    size="small"
                    sx={{ ml: 0.5 }}
                  >
                    <DeleteIcon />
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
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={() => setRegisterOpen(true)}
              >
                Add Device
              </Button>
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
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                setSearchInput(value);
                startTransition(() => {
                  setSearchTerm(value);
                });
              }}
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
                MenuProps={{
                  PaperProps: {
                    style: { maxHeight: 200 }
                  }
                }}
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
        {loading || isFetching ? (
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
          // Virtualized table view using react-window
          <TableContainer>
            <Table size="small" sx={{ tableLayout: 'fixed' }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ width: 140 }}>Status</TableCell>
                  <TableCell sx={{ width: '28%' }}>Name</TableCell>
                  <TableCell sx={{ width: '20%' }}>IP Address</TableCell>
                  <TableCell sx={{ width: 140 }}>Last Seen</TableCell>
                  <TableCell>Current Media</TableCell>
                  <TableCell align="right" sx={{ width: 220 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
            </Table>
            <List
              height={480}
              itemCount={filteredDevices.length}
              itemSize={56}
              width={'100%'}
              style={{ overflowX: 'hidden' }}
            >
              {({ index, style }) => {
                const device = filteredDevices[index];
                return (
                  <div style={style} key={device.id}>
                    <Table size="small" sx={{ tableLayout: 'fixed' }}>
                      <TableBody>
                        <TableRow 
                          hover
                          sx={{
                            '& td': { 
                              borderLeft: device.status === 'online' ? '4px solid' : 'none',
                              borderLeftColor: 'success.main'
                            }
                          }}
                        >
                          <TableCell sx={{ width: 140 }}>
                            <Chip
                              icon={<CircleIcon sx={{ fontSize: 12 }} />}
                              label={device.status}
                              color={getStatusColor(device.status)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell sx={{ width: '28%' }}>
                            <Box display="flex" alignItems="center">
                              <ComputerIcon sx={{ mr: 1, color: 'text.secondary' }} />
                              {device.name}
                            </Box>
                          </TableCell>
                          <TableCell sx={{ width: '20%' }}>{device.ip}</TableCell>
                          <TableCell sx={{ width: 140 }}>{getLastSeenText(device.last_ping)}</TableCell>
                          <TableCell>
                            {device.current_media || <em>None</em>}
                          </TableCell>
                          <TableCell align="right" sx={{ width: 220 }}>
                            <Tooltip title="Screenshot">
                              <span>
                                <IconButton 
                                  color="primary"
                                  onClick={() => handleTakeScreenshot(device)}
                                  disabled={device.status !== 'online'}
                                  size="small"
                                >
                                  <CameraIcon />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title="Send Command">
                              <IconButton 
                                color="primary"
                                onClick={() => {
                                  setCmdDevice(device.id);
                                  setCmdOpen(true);
                                }}
                                size="small"
                                sx={{ ml: 0.5 }}
                              >
                                <SendIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit Device">
                              <IconButton
                                onClick={() => {
                                  setEditDevice({ ...device });
                                  setEditOpen(true);
                                }}
                                size="small"
                                sx={{ ml: 0.5 }}
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete Device">
                              <IconButton
                                color="error"
                                onClick={() => {
                                  setDeviceToDelete(device);
                                  setDeleteOpen(true);
                                }}
                                size="small"
                                sx={{ ml: 0.5 }}
                              >
                                <DeleteIcon />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                );
              }}
            </List>
          </TableContainer>
        )}
      </Paper>

      {/* Command Dialog */}
      <Dialog open={cmdOpen} keepMounted onClose={() => setCmdOpen(false)} maxWidth="sm" fullWidth>
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

      {/* Device Registration Dialog */}
      <Dialog open={registerOpen} keepMounted onClose={() => setRegisterOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Register New Device</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the 6-digit registration code displayed on the device screen and give the device a name.
          </Typography>
          <TextField
            label="Registration Code"
            value={registrationCode}
            onChange={(e) => setRegistrationCode(e.target.value)}
            fullWidth
            margin="normal"
            placeholder="123456"
            inputProps={{ maxLength: 6 }}
            helperText="6-digit code shown on device screen"
          />
          <TextField
            label="Device Name"
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            fullWidth
            margin="normal"
            placeholder="Conference Room TV"
            helperText="Give this device a descriptive name"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleRegisterDevice} 
            variant="contained" 
            disabled={!registrationCode.trim() || !deviceName.trim()}
          >
            Register Device
          </Button>
        </DialogActions>
      </Dialog>

      {/* Device Edit Dialog */}
      <Dialog open={editOpen} keepMounted onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Device</DialogTitle>
        <DialogContent>
          <TextField
            label="Device Name"
            value={editDevice?.name || ''}
            onChange={(e) => setEditDevice({ ...editDevice, name: e.target.value })}
            fullWidth
            margin="normal"
            placeholder="Conference Room TV"
          />
          <TextField
            label="IP Address"
            value={editDevice?.ip || ''}
            onChange={(e) => setEditDevice({ ...editDevice, ip: e.target.value })}
            fullWidth
            margin="normal"
            placeholder="192.168.1.100"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleEditDevice} 
            variant="contained"
            disabled={!editDevice?.name?.trim()}
          >
            Update Device
          </Button>
        </DialogActions>
      </Dialog>

      {/* Device Delete Confirmation Dialog */}
      <Dialog open={deleteOpen} keepMounted onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Device</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete the device "{deviceToDelete?.name}"?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            This action cannot be undone. The device will need to be re-registered if you want to add it back.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancel</Button>
          <Button 
            onClick={handleDeleteDevice} 
            variant="contained" 
            color="error"
          >
            Delete Device
          </Button>
        </DialogActions>
      </Dialog>

      {/* Screenshot Dialog */}
      <Dialog 
        open={screenshotOpen} 
        keepMounted
        onClose={() => setScreenshotOpen(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle>
          Device Screenshot - {screenshotDevice?.name}
        </DialogTitle>
        <DialogContent>
          {screenshotLoading ? (
            <Box 
              display="flex" 
              flexDirection="column" 
              alignItems="center" 
              justifyContent="center" 
              py={4}
            >
              <Typography variant="body1" sx={{ mb: 2 }}>
                Taking screenshot...
              </Typography>
              <Box sx={{ width: '100%', maxWidth: 300 }}>
                <div style={{ 
                  width: '100%', 
                  height: '4px', 
                  backgroundColor: '#e0e0e0', 
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#2196f3',
                    animation: 'loading 2s ease-in-out infinite'
                  }} />
                </div>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                This may take a few seconds...
              </Typography>
            </Box>
          ) : screenshotUrl ? (
            <Box textAlign="center">
              <img 
                src={screenshotUrl} 
                alt="Device Screenshot" 
                style={{ 
                  maxWidth: '100%', 
                  maxHeight: '70vh', 
                  border: '1px solid #ddd',
                  borderRadius: '4px'
                }} 
              />
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Screenshot taken: {new Date().toLocaleTimeString()}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body1" color="text.secondary">
              No screenshot available
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScreenshotOpen(false)}>Close</Button>
          {screenshotUrl && (
            <Button 
              onClick={() => handleTakeScreenshot(screenshotDevice)}
              variant="outlined"
              startIcon={<CameraIcon />}
            >
              Take New Screenshot
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert 
          onClose={() => setSnackbar({ ...snackbar, open: false })} 
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default DeviceGrid; 