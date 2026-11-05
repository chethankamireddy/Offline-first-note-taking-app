import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  setActiveFolderId,
  createFolder,
  deleteFolder,
} from '../store/notesSlice';
import { syncEngine } from '../services/syncEngine';
import {
  Folder,
  FileText,
  Trash2,
  Plus,
  Cloud,
  Layers,
  Sliders,
  ChevronRight,
  FolderPlus,
  X,
  Check,
} from 'lucide-react';

export default function Sidebar({ onOpenQueueDrawer }) {
  const dispatch = useDispatch();
  const { notes, folders, activeFolderId, networkStatus } = useSelector(
    (state) => state.notes
  );

  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Counts for folders
  const allNotesCount = notes.filter((n) => !n.isDeleted).length;
  const defaultNotesCount = notes.filter(
    (n) => !n.isDeleted && (n.folderId === 'notes' || !n.folderId)
  ).length;
  const trashCount = notes.filter((n) => n.isDeleted).length;

  const handleCreateFolder = (e) => {
    e.preventDefault();
    if (newFolderName.trim()) {
      dispatch(createFolder({ name: newFolderName.trim() }));
      setNewFolderName('');
      setIsCreatingFolder(false);
    }
  };

  const handleDeleteFolder = (e, folderId) => {
    e.stopPropagation();
    if (confirm('Delete this folder? Notes inside will be moved to "Notes".')) {
      dispatch(deleteFolder(folderId));
    }
  };

  const toggleSimulatedOffline = () => {
    syncEngine.setSimulatedOffline(!networkStatus.simulatedOffline);
  };

  return (
    <aside className="apple-sidebar">
      {/* Sidebar Header / Section */}
      <div className="sidebar-section-title">
        <span>Folders</span>
      </div>

      <nav className="folder-list">
        {/* All Notes */}
        <div
          onClick={() => dispatch(setActiveFolderId('all'))}
          className={`folder-item ${activeFolderId === 'all' ? 'folder-active' : ''}`}
        >
          <div className="folder-item-left">
            <FileText size={17} className="folder-icon folder-icon-yellow" />
            <span className="folder-name">All Notes</span>
          </div>
          <span className="folder-count">{allNotesCount}</span>
        </div>

        {/* Notes (Default) */}
        <div
          onClick={() => dispatch(setActiveFolderId('notes'))}
          className={`folder-item ${activeFolderId === 'notes' ? 'folder-active' : ''}`}
        >
          <div className="folder-item-left">
            <Folder size={17} className="folder-icon folder-icon-yellow" />
            <span className="folder-name">Notes</span>
          </div>
          <span className="folder-count">{defaultNotesCount}</span>
        </div>

        {/* Recently Deleted */}
        <div
          onClick={() => dispatch(setActiveFolderId('trash'))}
          className={`folder-item ${activeFolderId === 'trash' ? 'folder-active' : ''}`}
        >
          <div className="folder-item-left">
            <Trash2 size={17} className="folder-icon folder-icon-muted" />
            <span className="folder-name">Recently Deleted</span>
          </div>
          <span className="folder-count">{trashCount}</span>
        </div>

        {/* Custom Folders Section */}
        {folders.filter((f) => f.id !== 'notes').length > 0 && (
          <div className="sidebar-subheading">
            <span>Folders</span>
          </div>
        )}

        {folders
          .filter((f) => f.id !== 'notes')
          .map((folder) => {
            const count = notes.filter(
              (n) => !n.isDeleted && n.folderId === folder.id
            ).length;
            const isActive = activeFolderId === folder.id;

            return (
              <div
                key={folder.id}
                onClick={() => dispatch(setActiveFolderId(folder.id))}
                className={`folder-item ${isActive ? 'folder-active' : ''}`}
              >
                <div className="folder-item-left">
                  <Folder size={17} className="folder-icon folder-icon-yellow" />
                  <span className="folder-name">{folder.name}</span>
                </div>
                <div className="folder-item-right">
                  <span className="folder-count">{count}</span>
                  <button
                    onClick={(e) => handleDeleteFolder(e, folder.id)}
                    className="btn-folder-delete"
                    title="Delete folder"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
      </nav>

      {/* Inline New Folder Creator */}
      {isCreatingFolder && (
        <form onSubmit={handleCreateFolder} className="new-folder-form">
          <input
            type="text"
            autoFocus
            placeholder="Folder Name"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            className="new-folder-input"
          />
          <div className="new-folder-actions">
            <button type="submit" className="btn-icon-tiny" title="Save">
              <Check size={14} />
            </button>
            <button
              type="button"
              onClick={() => setIsCreatingFolder(false)}
              className="btn-icon-tiny"
              title="Cancel"
            >
              <X size={14} />
            </button>
          </div>
        </form>
      )}

      {/* Sidebar Footer */}
      <div className="sidebar-footer">
        <button
          onClick={() => setIsCreatingFolder(true)}
          className="btn-new-folder"
        >
          <FolderPlus size={16} />
          <span>New Folder</span>
        </button>

        {/* Offline Engine status controls */}
        <div className="sidebar-sync-tools">
          <button
            onClick={toggleSimulatedOffline}
            className={`btn-sync-tool ${
              networkStatus.simulatedOffline ? 'tool-offline-active' : ''
            }`}
            title="Toggle Simulated Offline Mode"
          >
            <Sliders size={14} />
            <span>{networkStatus.simulatedOffline ? 'Sim Offline' : 'Online'}</span>
          </button>

          <button
            onClick={onOpenQueueDrawer}
            className="btn-sync-tool"
            title="Inspect Sync Queue & Squashing"
          >
            <Layers size={14} />
            <span>Queue</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
