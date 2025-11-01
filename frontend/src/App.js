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
import DeviceGrid from './components/DeviceGrid';
import MediaManager from './components/MediaManager';
import Playlists from './components/Playlists';
import Schedules from './components/Schedules';
import Login from './components/Login';
import { BrowserRouter as Router, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { isAuthenticated, logout } from './utils/api';
import Box from '@mui/material/Box';

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

// Protected Route Component
function ProtectedRoute({ children }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

function AppContent() {
  const navigate = useNavigate();
  
  const handleLogout = () => {
    logout();
  };
  
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
            <ListItemButton onClick={handleLogout}>
              <ListItemIcon sx={{ color: 'primary.main' }}><LogoutIcon /></ListItemIcon>
              <ListItemText primary="Logout" />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>
      <Container maxWidth={false} sx={{ mt: 4, ml: 28, mr: 4, maxWidth: 'calc(100vw - 280px)' }}>
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
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <AppContent />
            </ProtectedRoute>
          } />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

export default App;