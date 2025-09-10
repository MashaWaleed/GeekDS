import React, { useState, useEffect } from 'react';
import { Box, Breadcrumbs, Link, Typography, Button, TextField, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemText, ListItemSecondaryAction, Paper } from '@mui/material';
import { Folder, CreateNewFolder, Edit, Delete } from '@mui/icons-material';
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

function FolderNavigator({ resourceType, onFolderSelect }) {
    const [folders, setFolders] = useState([]);
    const [path, setPath] = useState([]);
    const [newFolderName, setNewFolderName] = useState('');
    const [openNewFolderDialog, setOpenNewFolderDialog] = useState(false);
    const [editingFolder, setEditingFolder] = useState(null);
    const [renamingFolderName, setRenamingFolderName] = useState('');

    const currentParentId = path.length > 0 ? path[path.length - 1].id : null;

    const fetchFolders = async () => {
        try {
            const response = await axios.get(`${API_URL}/folders/${resourceType}`, { params: { parentId: currentParentId } });
            setFolders(response.data);
        } catch (error) {
            console.error('Error fetching folders:', error);
        }
    };

    useEffect(() => {
        fetchFolders();
        onFolderSelect(currentParentId);
    }, [path, resourceType]);

    const handleCreateFolder = async () => {
        if (!newFolderName.trim()) return;
        try {
            await axios.post(`${API_URL}/folders`, {
                name: newFolderName,
                resourceType: resourceType,
                parentId: currentParentId,
            });
            setNewFolderName('');
            setOpenNewFolderDialog(false);
            fetchFolders();
        } catch (error) {
            console.error('Error creating folder:', error);
        }
    };

    const handleDeleteFolder = async (folderId) => {
        if (window.confirm('Are you sure you want to delete this folder and all its contents?')) {
            try {
                await axios.delete(`${API_URL}/folders/${folderId}`);
                fetchFolders();
            } catch (error) {
                console.error('Error deleting folder:', error);
            }
        }
    };
    
    const handleRenameFolder = async () => {
        if (!renamingFolderName.trim() || !editingFolder) return;
        try {
            await axios.patch(`${API_URL}/folders/${editingFolder.id}`, { name: renamingFolderName });
            setEditingFolder(null);
            setRenamingFolderName('');
            fetchFolders();
        } catch (error) {
            console.error('Error renaming folder:', error);
        }
    };

    const handleBreadcrumbClick = (index) => {
        setPath(path.slice(0, index + 1));
    };

    const handleFolderClick = (folder) => {
        setPath([...path, { id: folder.id, name: folder.name }]);
    };

    const startEditing = (folder) => {
        setEditingFolder(folder);
        setRenamingFolderName(folder.name);
    };

    return (
        <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Breadcrumbs aria-label="breadcrumb">
                    <Link component="button" underline="hover" color="inherit" onClick={() => setPath([])}>
                        Root
                    </Link>
                    {path.map((p, index) => (
                        <Link component="button" underline="hover" color="inherit" key={p.id} onClick={() => handleBreadcrumbClick(index)}>
                            {p.name}
                        </Link>
                    ))}
                </Breadcrumbs>
                <Button variant="contained" startIcon={<CreateNewFolder />} onClick={() => setOpenNewFolderDialog(true)}>
                    New Folder
                </Button>
            </Box>

            <List>
                {folders.map((folder) => (
                    <ListItem key={folder.id} button>
                        <Folder sx={{ mr: 2 }} />
                        <ListItemText primary={folder.name} onClick={() => handleFolderClick(folder)} />
                        <ListItemSecondaryAction>
                            <IconButton edge="end" aria-label="edit" onClick={() => startEditing(folder)}>
                                <Edit />
                            </IconButton>
                            <IconButton edge="end" aria-label="delete" onClick={() => handleDeleteFolder(folder.id)}>
                                <Delete />
                            </IconButton>
                        </ListItemSecondaryAction>
                    </ListItem>
                ))}
            </List>

            {/* New Folder Dialog */}
            <Dialog open={openNewFolderDialog} onClose={() => setOpenNewFolderDialog(false)}>
                <DialogTitle>Create New Folder</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Folder Name"
                        type="text"
                        fullWidth
                        variant="standard"
                        value={newFolderName}
                        onChange={(e) => setNewFolderName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenNewFolderDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreateFolder}>Create</Button>
                </DialogActions>
            </Dialog>

            {/* Rename Folder Dialog */}
            <Dialog open={!!editingFolder} onClose={() => setEditingFolder(null)}>
                <DialogTitle>Rename Folder</DialogTitle>
                <DialogContent>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="New Folder Name"
                        type="text"
                        fullWidth
                        variant="standard"
                        value={renamingFolderName}
                        onChange={(e) => setRenamingFolderName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleRenameFolder()}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditingFolder(null)}>Cancel</Button>
                    <Button onClick={handleRenameFolder}>Rename</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
}

export default FolderNavigator;
