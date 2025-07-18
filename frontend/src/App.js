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
import DeviceGrid from './components/DeviceGrid';
import MediaManager from './components/MediaManager';
import Playlists from './components/Playlists';
import Schedules from './components/Schedules';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';

const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#1976d2' },
    background: { default: '#121212', paper: '#1e1e1e' },
  },
  typography: {
    fontFamily: 'Roboto, Arial',
  },
});

const navItems = [
  { label: 'Devices', path: '/' },
  { label: 'Media', path: '/media' },
  { label: 'Playlists', path: '/playlists' },
  { label: 'Schedules', path: '/schedules' },
];

function AppContent() {
  const navigate = useNavigate();
  return (
    <>
      <Drawer variant="permanent" sx={{ width: 200, flexShrink: 0, [`& .MuiDrawer-paper`]: { width: 200, boxSizing: 'border-box', background: '#181818', color: '#fff' } }}>
        <List>
          {navItems.map(item => (
            <ListItem disablePadding key={item.path}>
              <ListItemButton onClick={() => navigate(item.path)}>
                <ListItemText primary={item.label} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>
      <Container maxWidth="md" sx={{ mt: 8, ml: 25 }}>
        <Typography variant="h3" align="center" gutterBottom>
          Digital Signage CMS
        </Typography>
        <Routes>
          <Route path="/" element={<DeviceGrid />} />
          <Route path="/media" element={<MediaManager />} />
          <Route path="/playlists" element={<Playlists />} />
          <Route path="/schedules" element={<Schedules />} />
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
        <AppContent />
      </Router>
    </ThemeProvider>
  );
}

export default App; 