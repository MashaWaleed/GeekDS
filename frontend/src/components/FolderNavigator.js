import React, { useState, useEffect } from 'react';
import { 
    Box, 
    Breadcrumbs, 
    Link, 
    Typography, 
    Button, 
    TextField, 
    Dialog, 
    DialogActions, 
    DialogContent, 
    DialogTitle, 
    IconButton, 
    List, 
    ListItem, 
    ListItemText, 
    ListItemIcon,
    ListItemButton,
    ListItemSecondaryAction, 
    Paper,
    Chip,
    Tooltip,
    Menu,
    MenuItem,
    Divider,
    InputAdornment,
    Alert
} from '@mui/material';
import { 
    Folder as FolderIcon, 
    CreateNewFolder as CreateNewFolderIcon, 
    Edit as EditIcon, 
    Delete as DeleteIcon,
    Home as HomeIcon,
    ArrowBack as ArrowBackIcon,
    ArrowForward as ArrowForwardIcon,
    MoreVert as MoreVertIcon,
    DriveFileMove as MoveIcon,
    FileCopy as CopyIcon,
    Search as SearchIcon,
    ViewList as ViewListIcon,
    ViewModule as ViewModuleIcon,
    Sort as SortIcon
} from '@mui/icons-material';

const API_URL = process.env.REACT_APP_API_URL;

function FolderNavigator({ resourceType, onFolderSelect, currentFolder, onFolderChange }) {
    const [folders, setFolders] = useState([]);
    const [path, setPath] = useState([]);
    const [newFolderName, setNewFolderName] = useState('');
    const [openNewFolderDialog, setOpenNewFolderDialog] = useState(false);
    const [editingFolder, setEditingFolder] = useState(null);
    const [renamingFolderName, setRenamingFolderName] = useState('');
    const [error, setError] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
    const [sortBy, setSortBy] = useState('name'); // 'name', 'date', 'type'
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [selectedFolder, setSelectedFolder] = useState(null);
    const [history, setHistory] = useState([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    const currentParentId = path.length > 0 ? path[path.length - 1].id : null;

    const fetchFolders = async () => {
        try {
            const response = await fetch(`${API_URL}/api/folders?type=${resourceType}`);
            if (!response.ok) throw new Error('Failed to fetch folders');
            const data = await response.json();
            
            // Filter folders based on current parent
            const filteredFolders = data.filter(folder => 
                folder.parent_id === currentParentId
            );
            
            setFolders(filteredFolders);
            setError('');
        } catch (error) {
            console.error('Error fetching folders:', error);
            setError('Failed to load folders');
        }
    };

    useEffect(() => {
        fetchFolders();
        onFolderSelect && onFolderSelect(currentParentId);
    }, [path, resourceType]);

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        
        try {
            const response = await fetch(`${API_URL}/api/folders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: newFolderName.trim(),
                    parent_id: currentParentId,
                    createBoth: true // Always create unified folders
                })
            });
            
            if (!response.ok) throw new Error('Failed to create folder');
            
            setNewFolderName('');
            setOpenNewFolderDialog(false);
            fetchFolders();
            setError('');
        } catch (error) {
            console.error('Error creating folder:', error);
            setError('Failed to create folder');
        }
    };

    const handleDeleteFolder = async (folder) => {
        if (!window.confirm(`Are you sure you want to delete "${folder.name}" and move all its contents to the parent folder?`)) {
            return;
        }
        
        try {
            const response = await fetch(`${API_URL}/api/folders/${folder.id}?deleteCorresponding=true`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('Failed to delete folder');
            
            fetchFolders();
            setError('');
            handleMenuClose();
        } catch (error) {
            console.error('Error deleting folder:', error);
            setError('Failed to delete folder');
        }
    };
    
    const handleRenameFolder = async () => {
        if (!renamingFolderName.trim() || !editingFolder) return;
        
        try {
            const response = await fetch(`${API_URL}/api/folders/${editingFolder.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: renamingFolderName.trim(),
                    parent_id: editingFolder.parent_id,
                    updateCorresponding: true // Always update unified folders
                })
            });
            
            if (!response.ok) throw new Error('Failed to rename folder');
            
            setEditingFolder(null);
            setRenamingFolderName('');
            fetchFolders();
            setError('');
        } catch (error) {
            console.error('Error renaming folder:', error);
            setError('Failed to rename folder');
        }
    };

    const navigateToFolder = (folder) => {
        const newPath = [...path, { id: folder.id, name: folder.name }];
        setPath(newPath);
        
        // Update history for back/forward navigation
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newPath);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        
        onFolderChange && onFolderChange(folder.id);
    };

    const navigateBack = () => {
        if (historyIndex > 0) {
            setHistoryIndex(historyIndex - 1);
            setPath(history[historyIndex - 1]);
        }
    };

    const navigateForward = () => {
        if (historyIndex < history.length - 1) {
            setHistoryIndex(historyIndex + 1);
            setPath(history[historyIndex + 1]);
        }
    };

    const handleBreadcrumbClick = (index) => {
        const newPath = path.slice(0, index + 1);
        setPath(newPath);
        
        // Update history
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newPath);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const goToRoot = () => {
        setPath([]);
        
        // Update history
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push([]);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    };

    const handleMenuOpen = (event, folder) => {
        setMenuAnchor(event.currentTarget);
        setSelectedFolder(folder);
    };

    const handleMenuClose = () => {
        setMenuAnchor(null);
        setSelectedFolder(null);
    };

    const startEditing = (folder) => {
        setEditingFolder(folder);
        setRenamingFolderName(folder.name);
        handleMenuClose();
    };

    const filteredFolders = folders.filter(folder =>
        folder.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const sortedFolders = [...filteredFolders].sort((a, b) => {
        switch (sortBy) {
            case 'name':
                return a.name.localeCompare(b.name);
            case 'date':
                return new Date(b.updated_at) - new Date(a.updated_at);
            default:
                return a.name.localeCompare(b.name);
        }
    });

    return (
        <Paper elevation={2} sx={{ p: 3, mb: 3, borderRadius: 2 }}>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}
            
            {/* Navigation Bar */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                {/* Back/Forward buttons */}
                <Tooltip title="Back">
                    <IconButton 
                        onClick={navigateBack} 
                        disabled={historyIndex <= 0}
                        size="small"
                    >
                        <ArrowBackIcon />
                    </IconButton>
                </Tooltip>
                <Tooltip title="Forward">
                    <IconButton 
                        onClick={navigateForward} 
                        disabled={historyIndex >= history.length - 1}
                        size="small"
                    >
                        <ArrowForwardIcon />
                    </IconButton>
                </Tooltip>
                
                <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />
                
                {/* Breadcrumbs */}
                <Box sx={{ flexGrow: 1 }}>
                    <Breadcrumbs aria-label="folder navigation">
                        <Link 
                            component="button" 
                            underline="hover" 
                            color="inherit" 
                            onClick={goToRoot}
                            sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
                        >
                            <HomeIcon fontSize="small" />
                            Root
                        </Link>
                        {path.map((p, index) => (
                            <Link 
                                component="button" 
                                underline="hover" 
                                color="inherit" 
                                key={p.id} 
                                onClick={() => handleBreadcrumbClick(index)}
                            >
                                {p.name}
                            </Link>
                        ))}
                    </Breadcrumbs>
                </Box>
                
                {/* Action buttons */}
                <Button 
                    variant="contained" 
                    startIcon={<CreateNewFolderIcon />} 
                    onClick={() => setOpenNewFolderDialog(true)}
                    size="small"
                >
                    New Folder
                </Button>
            </Box>

            {/* Search and View Controls */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                <TextField
                    size="small"
                    placeholder="Search folders..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    }}
                    sx={{ minWidth: 200 }}
                />
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title="Sort by">
                        <IconButton
                            size="small"
                            onClick={(e) => {
                                // You can implement a sort menu here
                                setSortBy(sortBy === 'name' ? 'date' : 'name');
                            }}
                        >
                            <SortIcon />
                        </IconButton>
                    </Tooltip>
                    
                    <Tooltip title={viewMode === 'list' ? 'Grid view' : 'List view'}>
                        <IconButton
                            size="small"
                            onClick={() => setViewMode(viewMode === 'list' ? 'grid' : 'list')}
                        >
                            {viewMode === 'list' ? <ViewModuleIcon /> : <ViewListIcon />}
                        </IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {/* Folder List */}
            {sortedFolders.length === 0 ? (
                <Box sx={{ textAlign: 'center', py: 4, color: 'text.secondary' }}>
                    {searchTerm ? `No folders found matching "${searchTerm}"` : 'No folders in this location'}
                </Box>
            ) : (
                <List dense>
                    {sortedFolders.map((folder) => (
                        <ListItem key={folder.id} disablePadding>
                            <ListItemButton 
                                onClick={() => navigateToFolder(folder)}
                                sx={{ borderRadius: 1 }}
                            >
                                <ListItemIcon>
                                    <FolderIcon color="primary" />
                                </ListItemIcon>
                                <ListItemText 
                                    primary={folder.name}
                                    secondary={`Modified ${new Date(folder.updated_at).toLocaleDateString()}`}
                                />
                                <ListItemSecondaryAction>
                                    <IconButton 
                                        edge="end" 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleMenuOpen(e, folder);
                                        }}
                                        size="small"
                                    >
                                        <MoreVertIcon />
                                    </IconButton>
                                </ListItemSecondaryAction>
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            )}

            {/* Context Menu */}
            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={handleMenuClose}
            >
                <MenuItem onClick={() => startEditing(selectedFolder)}>
                    <ListItemIcon>
                        <EditIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Rename</ListItemText>
                </MenuItem>
                <MenuItem onClick={() => handleDeleteFolder(selectedFolder)}>
                    <ListItemIcon>
                        <DeleteIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>Delete</ListItemText>
                </MenuItem>
            </Menu>

            {/* New Folder Dialog */}
            <Dialog open={openNewFolderDialog} onClose={() => setOpenNewFolderDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create New Folder</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Folder Name"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenNewFolderDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateFolder} variant="contained">Create</Button>
                </DialogActions>
            </Dialog>

            {/* Rename Folder Dialog */}
            <Dialog open={!!editingFolder} onClose={() => setEditingFolder(null)} maxWidth="sm" fullWidth>
                <DialogTitle>Rename Folder</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="New Folder Name"
                        type="text"
                        fullWidth
                        variant="outlined"
                        value={renamingFolderName}
                        onChange={(e) => setRenamingFolderName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleRenameFolder()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingFolder(null)}>Cancel</Button>
                    <Button onClick={handleRenameFolder} variant="contained">Rename</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

export default FolderNavigator;
