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
  MenuItem,
  Box,
  Grid,
  Alert,
  Checkbox,
  FormGroup,
  FormControlLabel,
  FormLabel,
  Switch,
  Card,
  CardContent,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  FormControl,
  InputLabel,
  Select,
  InputAdornment,
  Tooltip,
  Menu,
  ListItemIcon,
  ListItemText,
  Divider,
  Avatar,
  Badge
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Edit as EditIcon,
  Add as AddIcon,
  ExpandMore as ExpandMoreIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Schedule as ScheduleIcon,
  Computer as DeviceIcon,
  PlaylistPlay as PlaylistIcon,
  CalendarToday as CalendarIcon,
  AccessTime as TimeIcon,
  MoreVert as MoreVertIcon,
  Visibility as VisibilityIcon,
  FileCopy as CopyIcon,
  Pause as PauseIcon,
  PlayArrow as PlayIcon,
  Group as GroupIcon
} from '@mui/icons-material';

function Schedules() {
  const [schedules, setSchedules] = useState([]);
  const [devices, setDevices] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [deviceId, setDeviceId] = useState('');
  const [playlistId, setPlaylistId] = useState('');
  const [name, setName] = useState('');
  const [timeSlotStart, setTimeSlotStart] = useState('08:00');
  const [timeSlotEnd, setTimeSlotEnd] = useState('17:00');
  const [daysOfWeek, setDaysOfWeek] = useState([]);
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [isEnabled, setIsEnabled] = useState(true);
  const [apiError, setApiError] = useState('');

  // Enhanced UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [groupBy, setGroupBy] = useState('none'); // 'none', 'device', 'playlist', 'day'
  const [viewMode, setViewMode] = useState('table'); // 'table', 'cards'
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuItem, setMenuItem] = useState(null);

  const API_URL = process.env.REACT_APP_API_URL;

  // Enhanced filtering
  const filteredSchedules = schedules.filter(schedule => {
    const matchesSearch = 
      schedule.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      devices.find(d => d.id === schedule.device_id)?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      playlists.find(p => p.id === schedule.playlist_id)?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesDevice = deviceFilter === '' || schedule.device_id.toString() === deviceFilter;
    
    const matchesStatus = 
      statusFilter === 'all' ||
      (statusFilter === 'active' && schedule.is_enabled) ||
      (statusFilter === 'inactive' && !schedule.is_enabled) ||
      (statusFilter === 'current' && isCurrentlyActive(schedule));
    
    return matchesSearch && matchesDevice && matchesStatus;
  });

  // Check if a schedule is currently active
  const isCurrentlyActive = (schedule) => {
    if (!schedule.is_enabled) return false;
    
    const now = new Date();
    const currentDay = now.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
    const currentTime = now.toTimeString().slice(0, 5);
    
    // Check if today is in the schedule
    if (!schedule.days_of_week.includes(currentDay)) return false;
    
    // Check time slot (simplified check)
    return currentTime >= schedule.time_slot_start && currentTime <= schedule.time_slot_end;
  };

  // Group schedules
  const groupedSchedules = () => {
    if (groupBy === 'none') return { 'All Schedules': filteredSchedules };
    
    const groups = {};
    
    filteredSchedules.forEach(schedule => {
      let groupKey;
      
      switch (groupBy) {
        case 'device':
          const device = devices.find(d => d.id === schedule.device_id);
          groupKey = device ? device.name : 'Unknown Device';
          break;
        case 'playlist':
          const playlist = playlists.find(p => p.id === schedule.playlist_id);
          groupKey = playlist ? playlist.name : 'Unknown Playlist';
          break;
        case 'day':
          groupKey = schedule.days_of_week.join(', ');
          break;
        default:
          groupKey = 'All Schedules';
      }
      
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(schedule);
    });
    
    return groups;
  };

  // Statistics
  const getScheduleStats = () => {
    const total = schedules.length;
    const active = schedules.filter(s => s.is_enabled).length;
    const inactive = total - active;
    const currentlyRunning = schedules.filter(isCurrentlyActive).length;
    
    return { total, active, inactive, currentlyRunning };
  };

  const handleMenuOpen = (event, item) => {
    setMenuAnchor(event.currentTarget);
    setMenuItem(item);
  };

  const handleMenuClose = () => {
    setMenuAnchor(null);
    setMenuItem(null);
  };

  const handleToggleStatus = async (schedule) => {
    try {
      await fetch(`${API_URL}/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !schedule.is_enabled }),
      });
      fetchSchedules();
    } catch (error) {
      console.error('Error toggling schedule status:', error);
    }
  };

  const handleDuplicate = (schedule) => {
    setEditingSchedule(null);
    setName((schedule.name || '') + ' (Copy)');
    setDeviceId(schedule.device_id.toString());
    setPlaylistId(schedule.playlist_id.toString());
    setTimeSlotStart(toLocalTime(schedule.time_slot_start));
    setTimeSlotEnd(toLocalTime(schedule.time_slot_end));
    setDaysOfWeek([...schedule.days_of_week]);
    setValidFrom(schedule.valid_from || '');
    setValidUntil(schedule.valid_until || '');
    setIsEnabled(schedule.is_enabled);
    setApiError('');
    setOpen(true);
  };

  const renderScheduleCard = (schedule) => {
    const device = devices.find(d => d.id === schedule.device_id);
    const playlist = playlists.find(p => p.id === schedule.playlist_id);
    const isCurrentActive = isCurrentlyActive(schedule);
    
    return (
      <Grid item xs={12} sm={6} md={6} lg={4} key={schedule.id}>
        <Card 
          sx={{ 
            height: '100%',
            minHeight: 300,
            border: isCurrentActive ? '2px solid' : '1px solid',
            borderColor: isCurrentActive ? 'success.main' : 'divider',
            opacity: schedule.is_enabled ? 1 : 0.7
          }}
        >
          <CardContent sx={{ p: 3 }}>
            <Box display="flex" alignItems="center" mb={2}>
              <Avatar 
                sx={{ 
                  bgcolor: isCurrentActive ? 'success.main' : 'primary.main',
                  mr: 2 
                }}
              >
                {isCurrentActive ? <PlayIcon /> : <ScheduleIcon />}
              </Avatar>
              <Box flexGrow={1}>
                <Typography variant="h6" noWrap>
                  {schedule.name || 'Unnamed Schedule'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {device?.name || `Device ${schedule.device_id}`}
                </Typography>
              </Box>
              <IconButton
                size="small"
                onClick={(e) => handleMenuOpen(e, schedule)}
              >
                <MoreVertIcon />
              </IconButton>
            </Box>
            
            <Box mb={2}>
              <Box display="flex" alignItems="center" mb={1}>
                <TimeIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                <Typography variant="body2">
                  {toLocalTime(schedule.time_slot_start)} - {toLocalTime(schedule.time_slot_end)}
                </Typography>
              </Box>
              
              <Box display="flex" alignItems="center" mb={1}>
                <PlaylistIcon sx={{ fontSize: 16, mr: 1, color: 'text.secondary' }} />
                <Typography variant="body2" noWrap>
                  {playlist?.name || `Playlist ${schedule.playlist_id}`}
                </Typography>
              </Box>
              
              <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                {schedule.days_of_week.map(day => (
                  <Chip
                    key={day}
                    label={day.slice(0, 3)}
                    size="small"
                    variant="outlined"
                    color={isCurrentlyActive(schedule) ? 'success' : 'default'}
                  />
                ))}
              </Box>
            </Box>

            <Box display="flex" justifyContent="space-between" alignItems="center">
              <Chip
                label={schedule.is_enabled ? 'Active' : 'Disabled'}
                color={schedule.is_enabled ? 'success' : 'default'}
                size="small"
              />
              {isCurrentActive && (
                <Badge color="success" variant="dot">
                  <Chip label="Running" color="success" size="small" />
                </Badge>
              )}
            </Box>
          </CardContent>
        </Card>
      </Grid>
    );
  };

  const renderScheduleTable = (schedules) => (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Status</TableCell>
            <TableCell>Name</TableCell>
            <TableCell>Device</TableCell>
            <TableCell>Playlist</TableCell>
            <TableCell>Time Slot</TableCell>
            <TableCell>Days</TableCell>
            <TableCell>Valid Period</TableCell>
            <TableCell align="right">Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {schedules.map(sch => {
            const isCurrentActive = isCurrentlyActive(sch);
            const device = devices.find(d => d.id === sch.device_id);
            const playlist = playlists.find(p => p.id === sch.playlist_id);
            
            return (
              <TableRow 
                key={sch.id} 
                hover
                sx={{ 
                  opacity: sch.is_enabled ? 1 : 0.5,
                  backgroundColor: isCurrentActive ? 'success.light' : 'inherit',
                  '& td': { 
                    borderLeft: isCurrentActive ? '4px solid' : 'none',
                    borderLeftColor: 'success.main'
                  }
                }}
              >
                <TableCell>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Chip
                      icon={isCurrentActive ? <PlayIcon /> : <PauseIcon />}
                      label={sch.is_enabled ? 'Active' : 'Disabled'}
                      color={sch.is_enabled ? 'success' : 'default'}
                      size="small"
                    />
                    {isCurrentActive && <Badge color="success" variant="dot" />}
                  </Box>
                </TableCell>
                <TableCell>{sch.name || <em>Unnamed</em>}</TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center">
                    <DeviceIcon sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
                    {device?.name || `ID: ${sch.device_id}`}
                  </Box>
                </TableCell>
                <TableCell>
                  <Box display="flex" alignItems="center">
                    <PlaylistIcon sx={{ mr: 1, fontSize: 16, color: 'text.secondary' }} />
                    {playlist?.name || `ID: ${sch.playlist_id}`}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {`${toLocalTime(sch.time_slot_start)} - ${toLocalTime(sch.time_slot_end)}`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    ({Intl.DateTimeFormat().resolvedOptions().timeZone})
                  </Typography>
                </TableCell>
                <TableCell>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {sch.days_of_week.map(day => (
                      <Chip
                        key={day}
                        label={day.slice(0, 3)}
                        size="small"
                        variant="outlined"
                      />
                    ))}
                  </Box>
                </TableCell>
                <TableCell>
                  {sch.valid_from || sch.valid_until ? (
                    <Typography variant="body2">
                      {sch.valid_from ? new Date(sch.valid_from).toLocaleDateString() : 'Any'} 
                      {' → '}
                      {sch.valid_until ? new Date(sch.valid_until).toLocaleDateString() : 'Any'}
                    </Typography>
                  ) : (
                    <Typography variant="body2" color="text.secondary">Always</Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  <Tooltip title="More Options">
                    <IconButton 
                      size="small"
                      onClick={(e) => handleMenuOpen(e, sch)}
                    >
                      <MoreVertIcon />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );

  const fetchSchedules = () => {
    setLoading(true);
    fetch(`${API_URL}/api/schedules`)
      .then(res => res.json())
      .then(data => {
        setSchedules(data);
        setLoading(false);
      })
      .catch(error => {
        console.error('Error fetching schedules:', error);
        setApiError('Failed to fetch schedules.');
        setLoading(false);
      });
  };

  const fetchDependencies = () => {
    Promise.all([
      fetch(`${API_URL}/api/devices`).then(res => res.json()),
      fetch(`${API_URL}/api/playlists`).then(res => res.json())
    ]).then(([devicesData, playlistsData]) => {
      setDevices(devicesData);
      setPlaylists(playlistsData);
    }).catch(error => {
      console.error('Error fetching devices/playlists:', error);
      setApiError('Failed to fetch devices or playlists.');
    });
  };

  useEffect(() => {
    fetchSchedules();
    fetchDependencies();
  }, []);

  const handleOpenNewDialog = () => {
    setEditingSchedule(null);
    setName('');
    setDeviceId('');
    setPlaylistId('');
    setTimeSlotStart('08:00');
    setTimeSlotEnd('17:00');
    setDaysOfWeek(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    setValidFrom('');
    setValidUntil('');
    setIsEnabled(true);
    setApiError('');
    setOpen(true);
  };

  // Convert UTC time string to local time string
  const toLocalTime = (utcTimeStr) => {
    // Create a date object for today with the given UTC time
    const date = new Date();
    const [hours, minutes] = utcTimeStr.split(':');
    date.setUTCHours(parseInt(hours), parseInt(minutes), 0, 0);
    
    // Get local hours and minutes
    const localHours = date.getHours().toString().padStart(2, '0');
    const localMinutes = date.getMinutes().toString().padStart(2, '0');
    return `${localHours}:${localMinutes}`;
  };

  const handleEdit = (schedule) => {
    setEditingSchedule(schedule);
    setName(schedule.name || '');
    setDeviceId(schedule.device_id.toString());
    setPlaylistId(schedule.playlist_id.toString());
    // Convert UTC times to local times for editing
    setTimeSlotStart(toLocalTime(schedule.time_slot_start));
    setTimeSlotEnd(toLocalTime(schedule.time_slot_end));
    setDaysOfWeek(schedule.days_of_week || []);
    setValidFrom(schedule.valid_from || '');
    setValidUntil(schedule.valid_until || '');
    setIsEnabled(schedule.is_enabled);
    setApiError('');
    setOpen(true);
  };

  const handleCloseDialog = () => {
    setOpen(false);
    // A small delay to allow the dialog to close before clearing state
    setTimeout(() => {
        setEditingSchedule(null);
        setApiError('');
    }, 300);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this schedule?')) {
        try {
          const response = await fetch(`${API_URL}/api/schedules/${id}`, { method: 'DELETE' });
          if (!response.ok) throw new Error('Failed to delete schedule on the server.');
          fetchSchedules();
        } catch (error) {
          console.error('Error deleting schedule:', error);
          setApiError(error.message);
        }
    }
  };

  const handleSubmit = async () => {
    setApiError('');
    if (!deviceId || !playlistId || !timeSlotStart || !timeSlotEnd || daysOfWeek.length === 0) {
      setApiError('Please fill in all required fields and select at least one day.');
      return;
    }

    if (timeSlotStart >= timeSlotEnd) {
      setApiError('End time must be after start time.');
      return;
    }

    if (validFrom && validUntil && validFrom > validUntil) {
      setApiError('Valid until date must be after valid from date.');
      return;
    }

    // Convert time slots to UTC
    const toUTCTime = (timeStr) => {
      // Create a date object for today with the given time in local timezone
      const date = new Date();
      const [hours, minutes] = timeStr.split(':');
      date.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      
      // Convert to UTC time string and extract the time part
      const utcTimeStr = date.toISOString().split('T')[1];
      return utcTimeStr.slice(0, 5); // Returns HH:mm in UTC
    };

    const payload = {
      device_id: parseInt(deviceId),
      playlist_id: parseInt(playlistId),
      name: name.trim() || null,
      days_of_week: daysOfWeek,
      time_slot_start: toUTCTime(timeSlotStart),
      time_slot_end: toUTCTime(timeSlotEnd),
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      is_enabled: isEnabled
    };

    const url = editingSchedule
      ? `${API_URL}/api/schedules/${editingSchedule.id}`
      : `${API_URL}/api/schedules`;
    const method = editingSchedule ? 'PATCH' : 'POST';

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responseData = await response.json();
      if (!response.ok) {
        throw new Error(responseData.error || 'An unknown error occurred.');
      }

      handleCloseDialog();
      fetchSchedules();
    } catch (error) {
      console.error('Error saving schedule:', error);
      setApiError(`Failed to save schedule: ${error.message}`);
    }
  };

  return (
    <Box>
      {/* Header with Statistics */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h5" gutterBottom>
          Schedule Management
        </Typography>
        
        {/* Statistics Cards */}
        <Grid container spacing={2} mb={3}>
          {Object.entries(getScheduleStats()).map(([key, value]) => (
            <Grid item xs={6} sm={3} key={key}>
              <Card sx={{ textAlign: 'center' }}>
                <CardContent sx={{ py: 1 }}>
                  <Typography variant="h4" color={
                    key === 'currentlyRunning' ? 'success.main' :
                    key === 'active' ? 'primary.main' :
                    key === 'inactive' ? 'warning.main' : 'text.primary'
                  }>
                    {value}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {key === 'currentlyRunning' ? 'Running Now' :
                     key === 'active' ? 'Active' :
                     key === 'inactive' ? 'Inactive' : 'Total'}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Controls */}
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={3}>
            <TextField
              fullWidth
              size="small"
              placeholder="Search schedules..."
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
          
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Device</InputLabel>
              <Select
                value={deviceFilter}
                label="Device"
                onChange={(e) => setDeviceFilter(e.target.value)}
              >
                <MenuItem value="">All Devices</MenuItem>
                {devices.map(device => (
                  <MenuItem key={device.id} value={device.id.toString()}>
                    {device.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="active">Active Only</MenuItem>
                <MenuItem value="inactive">Inactive Only</MenuItem>
                <MenuItem value="current">Currently Running</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Group By</InputLabel>
              <Select
                value={groupBy}
                label="Group By"
                onChange={(e) => setGroupBy(e.target.value)}
              >
                <MenuItem value="none">No Grouping</MenuItem>
                <MenuItem value="device">Device</MenuItem>
                <MenuItem value="playlist">Playlist</MenuItem>
                <MenuItem value="day">Days</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={3}>
            <Box display="flex" gap={1} justifyContent="flex-end">
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenNewDialog}
              >
                New Schedule
              </Button>
            </Box>
          </Grid>
        </Grid>

        {/* Filter Summary */}
        <Box mt={2}>
          <Typography variant="body2" color="text.secondary">
            Showing {filteredSchedules.length} of {schedules.length} schedules
            {deviceFilter && ` • Device: ${devices.find(d => d.id.toString() === deviceFilter)?.name}`}
            {statusFilter !== 'all' && ` • Status: ${statusFilter}`}
            {searchTerm && ` • Search: "${searchTerm}"`}
          </Typography>
        </Box>
      </Paper>

      {/* Main Content */}
      <Paper sx={{ p: 2 }}>
        {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
        
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <Typography color="text.secondary">Loading schedules...</Typography>
          </Box>
        ) : filteredSchedules.length === 0 ? (
          <Box textAlign="center" py={4}>
            <ScheduleIcon sx={{ fontSize: 64, color: 'text.disabled', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {searchTerm || deviceFilter || statusFilter !== 'all' 
                ? 'No schedules match your filters' 
                : 'No schedules created yet'
              }
            </Typography>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {searchTerm || deviceFilter || statusFilter !== 'all'
                ? 'Try adjusting your search terms or filters'
                : 'Create your first schedule to get started'
              }
            </Typography>
            {!searchTerm && !deviceFilter && statusFilter === 'all' && (
              <Button
                variant="contained"
                startIcon={<AddIcon />}
                onClick={handleOpenNewDialog}
                sx={{ mt: 2 }}
              >
                Create Schedule
              </Button>
            )}
          </Box>
        ) : groupBy === 'none' ? (
          viewMode === 'cards' ? (
            <Grid container spacing={2}>
              {filteredSchedules.map(renderScheduleCard)}
            </Grid>
          ) : (
            renderScheduleTable(filteredSchedules)
          )
        ) : (
          Object.entries(groupedSchedules()).map(([groupName, groupSchedules]) => (
            <Accordion key={groupName} defaultExpanded>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Box display="flex" alignItems="center" gap={1}>
                  <GroupIcon />
                  <Typography variant="h6">{groupName}</Typography>
                  <Chip label={groupSchedules.length} size="small" />
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                {viewMode === 'cards' ? (
                  <Grid container spacing={2}>
                    {groupSchedules.map(renderScheduleCard)}
                  </Grid>
                ) : (
                  renderScheduleTable(groupSchedules)
                )}
              </AccordionDetails>
            </Accordion>
          ))
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
          <ListItemText>Edit Schedule</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          handleDuplicate(menuItem);
          handleMenuClose();
        }}>
          <ListItemIcon>
            <CopyIcon />
          </ListItemIcon>
          <ListItemText>Duplicate</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => {
          handleToggleStatus(menuItem);
          handleMenuClose();
        }}>
          <ListItemIcon>
            {menuItem?.is_enabled ? <PauseIcon /> : <PlayIcon />}
          </ListItemIcon>
          <ListItemText>
            {menuItem?.is_enabled ? 'Disable' : 'Enable'}
          </ListItemText>
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

      {/* Schedule Dialog - keeping existing dialog code */}
      <Dialog open={open} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{editingSchedule ? 'Edit Schedule' : 'New Schedule'}</DialogTitle>
        <DialogContent>
          {apiError && <Alert severity="error" sx={{ mb: 2 }}>{apiError}</Alert>}
          
          <Grid container spacing={2}>
            {/* Basic Info */}
            <Grid item xs={12}>
              <TextField
                label="Schedule Name"
                value={name}
                onChange={e => setName(e.target.value)}
                fullWidth
                margin="normal"
                placeholder="e.g., Morning Session"
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                select
                label="Device"
                value={deviceId}
                onChange={e => setDeviceId(e.target.value)}
                fullWidth
                required
                margin="normal"
              >
                {devices.map(d => (<MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>))}
              </TextField>
            </Grid>

            <Grid item xs={6}>
              <TextField
                select
                label="Playlist"
                value={playlistId}
                onChange={e => setPlaylistId(e.target.value)}
                fullWidth
                required
                margin="normal"
              >
                {playlists.map(p => (<MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>))}
              </TextField>
            </Grid>

            {/* Time Slots */}
            <Grid item xs={6}>
              <TextField
                label="Start Time"
                type="time"
                value={timeSlotStart}
                onChange={e => setTimeSlotStart(e.target.value)}
                fullWidth
                required
                margin="normal"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                label="End Time"
                type="time"
                value={timeSlotEnd}
                onChange={e => setTimeSlotEnd(e.target.value)}
                fullWidth
                required
                margin="normal"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Days of Week */}
            <Grid item xs={12}>
              <FormLabel component="legend">Days of Week</FormLabel>
              <FormGroup row>
                {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map(day => (
                  <FormControlLabel
                    key={day}
                    control={
                      <Checkbox
                        checked={daysOfWeek.includes(day)}
                        onChange={e => {
                          if (e.target.checked) {
                            setDaysOfWeek([...daysOfWeek, day]);
                          } else {
                            setDaysOfWeek(daysOfWeek.filter(d => d !== day));
                          }
                        }}
                      />
                    }
                    label={day.charAt(0).toUpperCase() + day.slice(1)}
                  />
                ))}
              </FormGroup>
            </Grid>

            {/* Valid Date Range */}
            <Grid item xs={6}>
              <TextField
                label="Valid From"
                type="date"
                value={validFrom}
                onChange={e => setValidFrom(e.target.value)}
                fullWidth
                margin="normal"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            <Grid item xs={6}>
              <TextField
                label="Valid Until"
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                fullWidth
                margin="normal"
                InputLabelProps={{ shrink: true }}
              />
            </Grid>

            {/* Enable/Disable Switch */}
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={isEnabled}
                    onChange={e => setIsEnabled(e.target.checked)}
                  />
                }
                label="Schedule Enabled"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingSchedule ? 'Update Schedule' : 'Create Schedule'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Schedules;