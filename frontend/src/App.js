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
    mode: 'light',
    primary: { 
      main: '#4CAF50',
      light: '#81C784',
      dark: '#388E3C'
    },
    secondary: {
      main: '#2E7D32',
      light: '#66BB6A',
      dark: '#1B5E20'
    },
    background: { 
      default: '#F1F8E9', 
      paper: '#fff' 
    },
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
          <img 
            src="/eternaHealthCareCity.png" 
            alt="EternaHealthCareCity" 
            style={{ height: 60, marginBottom: 16 }}
          />
          <Typography variant="h5" gutterBottom>EternaHealthCareCity Admin</Typography>
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
      <Drawer variant="permanent" sx={{ width: 220, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: 220, boxSizing: 'border-box', background: 'linear-gradient(180deg, #E8F5E8 0%, #F1F8E9 100%)', color: '#2E7D32' } }}>
        {/* Logo Section at Top of Sidebar */}
        <Box sx={{ p: 2, borderBottom: '1px solid #C8E6C9', textAlign: 'center' }}>
          <img 
            src="/eternaHealthCareCity.png" 
            alt="EternaHealthCareCity" 
            style={{ height: 50, maxWidth: '100%' }}
          />
          <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
            Digital Signage CMS
          </Typography>
        </Box>
        
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
      <Container maxWidth={false} sx={{ mt: 8, ml: 28, mr: 4, maxWidth: 'calc(100vw - 280px)' }}>
        <Box sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          mb: 4, 
          background: 'linear-gradient(135deg, #4CAF50 0%, #2E7D32 100%)',
          borderRadius: 3,
          p: 3,
          color: 'white',
          boxShadow: '0 8px 32px rgba(76, 175, 80, 0.3)'
        }}>
          <Typography 
            variant="h3" 
            sx={{ 
              fontWeight: 'bold',
              textAlign: 'center',
              textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
              letterSpacing: '1px'
            }}
          >
            EternaHealth CMS
          </Typography>
        </Box>
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