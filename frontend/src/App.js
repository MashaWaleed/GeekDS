import React, { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import DevicesIcon from '@mui/icons-material/Devices';
import VideoLibraryIcon from '@mui/icons-material/VideoLibrary';
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import EventIcon from '@mui/icons-material/Event';
import LogoutIcon from '@mui/icons-material/Logout';
import LockIcon from '@mui/icons-material/Lock';
import DeviceGrid from './components/DeviceGrid';
import MediaManager from './components/MediaManager';
import Playlists from './components/Playlists';
import Schedules from './components/Schedules';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';

const theme = createTheme({
  palette: {
    mode: 'light', // Light theme by default
    primary: { main: '#1976d2' },
    background: { default: '#f5f5f5', paper: '#fff' },
  },
  typography: {
    fontFamily: 'Roboto, Arial',
  },
});

const navItems = [
  { label: 'Devices', path: '/', icon: <DevicesIcon /> },
  { label: 'Media', path: '/media', icon: <VideoLibraryIcon /> },
  { label: 'Playlists', path: '/playlists', icon: <PlaylistPlayIcon /> },
  { label: 'Schedules', path: '/schedules', icon: <EventIcon /> },
];

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (username === 'eternaAdmin' && password === 'admin') {
      onLogin();
    } else {
      setError('Invalid username or password');
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5' }}>
      <Paper elevation={3} sx={{ p: 4, minWidth: 320 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 2 }}>
          <LockIcon color="primary" sx={{ fontSize: 40, mb: 1 }} />
          <Typography variant="h5" gutterBottom>Admin Login</Typography>
        </Box>
        <form onSubmit={handleSubmit}>
          <TextField label="Username" fullWidth margin="normal" value={username} onChange={e => setUsername(e.target.value)} autoFocus />
          <TextField label="Password" type="password" fullWidth margin="normal" value={password} onChange={e => setPassword(e.target.value)} />
          <Button type="submit" variant="contained" color="primary" fullWidth sx={{ mt: 2 }}>Login</Button>
        </form>
        <Snackbar open={!!error} autoHideDuration={3000} onClose={() => setError('')} message={error} />
      </Paper>
    </Box>
  );
}

function AppContent({ onLogout }) {
  const navigate = useNavigate();
  return (
    <>
      <Drawer variant="permanent" sx={{ width: 220, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: 220, boxSizing: 'border-box', background: '#fff', color: '#222' } }}>
        <List>
          {navItems.map(item => (
            <ListItem disablePadding key={item.path}>
              <ListItemButton onClick={() => navigate(item.path)}>
                <ListItemIcon sx={{ color: 'primary.main' }}>{item.icon}</ListItemIcon>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
          <ListItem disablePadding>
            <ListItemButton onClick={onLogout}>
              <ListItemIcon sx={{ color: 'primary.main' }}><LogoutIcon /></ListItemIcon>
              <ListItemText primary="Logout" />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>
      <Container maxWidth="md" sx={{ mt: 8, ml: 28 }}>
        <Typography variant="h3" align="center" gutterBottom>
          Digital Signage CMS
        </Typography>
        <Routes>
          <Route path="/" element={<DeviceGrid />} />
          <Route path="/media" element={<MediaManager />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/schedules" element={<Schedules />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Container>
    </>
  );
}

function App() {
  const [loggedIn, setLoggedIn] = useState(() => !!localStorage.getItem('cms_logged_in'));

  const handleLogin = () => {
    localStorage.setItem('cms_logged_in', '1');
    setLoggedIn(true);
  };
  const handleLogout = () => {
    localStorage.removeItem('cms_logged_in');
    setLoggedIn(false);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        {loggedIn ? <AppContent onLogout={handleLogout} /> : <LoginPage onLogin={handleLogin} />}
      </Router>
    </ThemeProvider>
  );
}

export default App; 