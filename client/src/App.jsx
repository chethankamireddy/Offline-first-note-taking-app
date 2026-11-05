import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  loadInitialData,
  conflictReconciled,
  createNote,
  setMobileView,
} from './store/notesSlice';
import { syncEngine } from './services/syncEngine';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import NoteList from './components/NoteList';
import NoteEditor from './components/NoteEditor';
import SyncQueueDrawer from './components/SyncQueueDrawer';
import ConflictModal from './components/ConflictModal';
import { ChevronLeft } from 'lucide-react';

export default function App() {
  const dispatch = useDispatch();
  const {
    notes,
    loading,
    isDarkMode,
    sidebarVisible,
    mobileView,
    activeFolderId,
  } = useSelector((state) => state.notes);
  const [isQueueDrawerOpen, setIsQueueDrawerOpen] = useState(false);

  // ── Resizable notes-list column ─────────────────────────────────────
  const NOTE_LIST_MIN = 220;
  const NOTE_LIST_MAX = 540;
  const [noteListWidth, setNoteListWidth] = useState(320);
  const isResizing = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onResizeStart = useCallback((e) => {
    isResizing.current = true;
    startX.current = e.clientX;
    startWidth.current = noteListWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [noteListWidth]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!isResizing.current) return;
      const delta = e.clientX - startX.current;
      const next = Math.min(NOTE_LIST_MAX, Math.max(NOTE_LIST_MIN, startWidth.current + delta));
      setNoteListWidth(next);
    };
    const onMouseUp = () => {
      if (!isResizing.current) return;
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);
  // ────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // 1. Load initial notes & folders from IndexedDB
    dispatch(loadInitialData()).then((action) => {
      const loadedNotes = action.payload?.notes || [];
      // If user has 0 notes, seed with an Apple Notes onboarding note
      if (loadedNotes.length === 0) {
        dispatch(
          createNote({
            title: 'Welcome to Apple Notes',
            content: `# Welcome to Apple Notes (NoteSync Edition)

This is a modern, pixel-inspired Apple Notes clone built with an **offline-first** engine.

### ✨ Checklist Demo:
- [x] Three-column desktop layout (Folders, Notes, Editor)
- [x] Folders: All Notes, Notes, Recently Deleted & Custom Folders
- [x] Pinned Notes section
- [ ] Try creating your own checklist item
- [ ] Toggle Dark Mode in the toolbar
- [ ] Test offline editing with "Sim Offline"

### 🚀 Under the Hood:
1. **IndexedDB (Dexie.js)** is the client Single Source of Truth.
2. **Client-Side UUIDs** guarantee 100% offline note creation.
3. **Last-Write-Wins (LWW)** resolves concurrent edits deterministically.
4. **Request Squashing** combines offline edits into a single batch request.
`,
            folderId: 'notes',
          })
        );
      }
    });

    // 2. Register conflict listener
    const unsubscribeConflict = syncEngine.onConflict((conflictDetail) => {
      dispatch(conflictReconciled(conflictDetail));
    });

    return () => {
      unsubscribeConflict();
    };
  }, [dispatch]);

  if (loading) {
    return (
      <div className={`apple-notes-app ${isDarkMode ? 'theme-dark' : 'theme-light'}`}>
        <div className="apple-app-loading">
          <div className="apple-spinner" />
          <p>Loading Notes...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`apple-notes-app ${
        isDarkMode ? 'theme-dark' : 'theme-light'
      }`}
    >
      {/* Top Window Bar */}
      <Navbar onToggleQueueDrawer={() => setIsQueueDrawerOpen((prev) => !prev)} />

      {/* Mobile Back Bar (Visible only on small screens when viewing note) */}
      <div className="mobile-nav-bar">
        {mobileView === 'editor' && (
          <button
            onClick={() => dispatch(setMobileView('notes'))}
            className="mobile-back-btn"
          >
            <ChevronLeft size={18} />
            <span>Notes</span>
          </button>
        )}
        {mobileView === 'notes' && (
          <button
            onClick={() => dispatch(setMobileView('folders'))}
            className="mobile-back-btn"
          >
            <ChevronLeft size={18} />
            <span>Folders</span>
          </button>
        )}
      </div>

      {/* 3-Column Main Workspace */}
      <div className={`apple-columns-container view-${mobileView}`}>
        {/* Column 1: Folders Sidebar */}
        {sidebarVisible && (
          <div className="col-sidebar">
            <Sidebar onOpenQueueDrawer={() => setIsQueueDrawerOpen(true)} />
          </div>
        )}

        {/* Column 2: Notes List */}
        <div className="col-notelist" style={{ width: noteListWidth, minWidth: noteListWidth }}>
          <NoteList />
          {/* Drag handle on right edge */}
          <div
            className="col-resize-handle"
            onMouseDown={onResizeStart}
            title="Drag to resize"
          />
        </div>

        {/* Column 3: Note Editor */}
        <div className="col-editor">
          <NoteEditor />
        </div>
      </div>

      {/* Offline Sync Queue Inspector Drawer */}
      <SyncQueueDrawer
        isOpen={isQueueDrawerOpen}
        onClose={() => setIsQueueDrawerOpen(false)}
      />

      {/* LWW Conflict Toast */}
      <ConflictModal />
    </div>
  );
}
