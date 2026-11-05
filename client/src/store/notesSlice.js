import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import { localDb } from '../db/dexieDb';
import { syncEngine } from '../services/syncEngine';

// Thunk: Load notes and folders from IndexedDB on startup
export const loadInitialData = createAsyncThunk(
  'notes/loadInitialData',
  async () => {
    const [notes, folders] = await Promise.all([
      localDb.getAllNotes(),
      localDb.getAllFolders(),
    ]);

    // Ensure default folder exists
    let initialFolders = folders;
    if (!folders || folders.length === 0) {
      const defaultFolder = {
        id: 'notes',
        name: 'Notes',
        createdAt: Date.now(),
      };
      await localDb.putFolder(defaultFolder);
      initialFolders = [defaultFolder];
    }

    return { notes, folders: initialFolders };
  }
);

// Thunk: Optimistic Create Note
export const createNote = createAsyncThunk(
  'notes/createNote',
  async ({ title = '', content = '', folderId = null } = {}, { getState }) => {
    const state = getState().notes;
    // Determine target folder
    let targetFolder = folderId;
    if (!targetFolder) {
      targetFolder =
        state.activeFolderId === 'all' || state.activeFolderId === 'trash'
          ? 'notes'
          : state.activeFolderId;
    }

    const now = Date.now();
    const newNote = {
      id: uuidv4(),
      title: title || 'New Note',
      content: content || '',
      folderId: targetFolder || 'notes',
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'UNSYNCED',
      isDeleted: false,
    };

    // 1. Write to local IndexedDB
    await localDb.putNote(newNote);

    // 2. Queue mutation in background sync engine
    syncEngine.recordMutation(newNote.id, 'CREATE', newNote);

    return newNote;
  }
);

// Thunk: Optimistic Update Note
export const updateNote = createAsyncThunk(
  'notes/updateNote',
  async ({ id, title, content, folderId, isPinned }, { getState }) => {
    const state = getState().notes;
    const existing = state.notes.find((n) => n.id === id);
    if (!existing) return null;

    const now = Date.now();
    const updatedNote = {
      ...existing,
      title: title !== undefined ? title : existing.title,
      content: content !== undefined ? content : existing.content,
      folderId: folderId !== undefined ? folderId : existing.folderId || 'notes',
      isPinned: isPinned !== undefined ? isPinned : existing.isPinned || false,
      updatedAt: now,
      syncStatus: 'UNSYNCED',
    };

    // 1. Immediate local write
    await localDb.putNote(updatedNote);

    // 2. Queue for background sync
    syncEngine.recordMutation(id, 'UPDATE', {
      id,
      title: updatedNote.title,
      content: updatedNote.content,
      folderId: updatedNote.folderId,
      isPinned: updatedNote.isPinned,
      updatedAt: now,
      isDeleted: updatedNote.isDeleted,
    });

    return updatedNote;
  }
);

// Thunk: Toggle Pin Note
export const togglePinNote = createAsyncThunk(
  'notes/togglePinNote',
  async (id, { dispatch, getState }) => {
    const state = getState().notes;
    const note = state.notes.find((n) => n.id === id);
    if (!note) return null;
    return await dispatch(
      updateNote({ id, isPinned: !note.isPinned })
    ).unwrap();
  }
);

// Thunk: Move Note to Folder
export const moveNoteToFolder = createAsyncThunk(
  'notes/moveNoteToFolder',
  async ({ noteId, folderId }, { dispatch }) => {
    return await dispatch(
      updateNote({ id: noteId, folderId })
    ).unwrap();
  }
);

// Thunk: Optimistic Soft Delete Note
export const deleteNote = createAsyncThunk(
  'notes/deleteNote',
  async (id) => {
    const now = Date.now();
    await localDb.softDeleteNote(id);
    syncEngine.recordMutation(id, 'DELETE', {
      id,
      updatedAt: now,
    });
    return { id, updatedAt: now };
  }
);

// Thunk: Restore Soft-Deleted Note
export const restoreNote = createAsyncThunk(
  'notes/restoreNote',
  async (id, { getState }) => {
    const state = getState().notes;
    const existing = state.notes.find((n) => n.id === id);
    if (!existing) return null;

    const now = Date.now();
    const restored = {
      ...existing,
      isDeleted: false,
      updatedAt: now,
      syncStatus: 'UNSYNCED',
    };

    await localDb.putNote(restored);
    syncEngine.recordMutation(id, 'UPDATE', {
      id,
      isDeleted: false,
      updatedAt: now,
    });
    return restored;
  }
);

// Thunk: Create Folder
export const createFolder = createAsyncThunk(
  'notes/createFolder',
  async ({ name }) => {
    const folder = {
      id: uuidv4(),
      name: name.trim() || 'New Folder',
      createdAt: Date.now(),
    };
    await localDb.putFolder(folder);
    return folder;
  }
);

// Thunk: Delete Folder
export const deleteFolder = createAsyncThunk(
  'notes/deleteFolder',
  async (folderId) => {
    await localDb.deleteFolder(folderId);
    return folderId;
  }
);

const initialDarkMode = localStorage.getItem('apple_notes_dark_mode') === 'true';

const initialState = {
  notes: [],
  folders: [{ id: 'notes', name: 'Notes' }],
  activeNoteId: null,
  activeFolderId: 'all', // 'all' | 'notes' | 'trash' | custom folder ID
  searchQuery: '',
  loading: true,
  lastConflict: null,
  isDarkMode: initialDarkMode,
  sidebarVisible: true,
  mobileView: 'editor', // 'folders' | 'notes' | 'editor' (for mobile navigation)
  networkStatus: {
    isOnline: navigator.onLine,
    browserOnline: navigator.onLine,
    simulatedOffline: false,
    isSyncing: false,
  },
};

export const notesSlice = createSlice({
  name: 'notes',
  initialState,
  reducers: {
    setActiveNoteId(state, action) {
      state.activeNoteId = action.payload;
      state.mobileView = 'editor';
    },
    setActiveFolderId(state, action) {
      state.activeFolderId = action.payload;
      state.mobileView = 'notes';
      // Auto-select first note in folder if available
      const notesInFolder = state.notes.filter((n) => {
        if (action.payload === 'all') return !n.isDeleted;
        if (action.payload === 'trash') return n.isDeleted;
        return !n.isDeleted && (n.folderId || 'notes') === action.payload;
      });
      state.activeNoteId = notesInFolder.length > 0 ? notesInFolder[0].id : null;
    },
    setSearchQuery(state, action) {
      state.searchQuery = action.payload;
    },
    toggleDarkMode(state) {
      state.isDarkMode = !state.isDarkMode;
      localStorage.setItem('apple_notes_dark_mode', String(state.isDarkMode));
    },
    toggleSidebar(state) {
      state.sidebarVisible = !state.sidebarVisible;
    },
    setMobileView(state, action) {
      state.mobileView = action.payload;
    },
    setNetworkStatus(state, action) {
      state.networkStatus = { ...state.networkStatus, ...action.payload };
    },
    syncStatusUpdated(state, action) {
      const { noteId, status } = action.payload;
      const note = state.notes.find((n) => n.id === noteId);
      if (note) {
        note.syncStatus = status;
      }
    },
    conflictReconciled(state, action) {
      const { serverNote, message } = action.payload;
      const idx = state.notes.findIndex(
        (n) => n.id === (serverNote._id || serverNote.id)
      );
      if (idx !== -1) {
        state.notes[idx] = {
          ...state.notes[idx],
          title: serverNote.title,
          content: serverNote.content,
          folderId: serverNote.folderId || state.notes[idx].folderId || 'notes',
          isPinned: serverNote.isPinned !== undefined ? serverNote.isPinned : state.notes[idx].isPinned,
          updatedAt: serverNote.updatedAt,
          syncStatus: 'SYNCED',
        };
      }
      state.lastConflict = {
        noteId: serverNote._id || serverNote.id,
        title: serverNote.title,
        message,
        timestamp: Date.now(),
      };
    },
    clearConflict(state) {
      state.lastConflict = null;
    },
    refreshNotes(state, action) {
      state.notes = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadInitialData.fulfilled, (state, action) => {
        state.notes = action.payload.notes || [];
        if (action.payload.folders && action.payload.folders.length > 0) {
          state.folders = action.payload.folders;
        }
        state.loading = false;
        if (!state.activeNoteId && state.notes.length > 0) {
          const firstActive = state.notes.find((n) => !n.isDeleted);
          if (firstActive) {
            state.activeNoteId = firstActive.id;
          }
        }
      })
      .addCase(loadInitialData.rejected, (state) => {
        state.loading = false;
        state.notes = [];
      })
      .addCase(createNote.fulfilled, (state, action) => {
        state.notes.unshift(action.payload);
        state.activeNoteId = action.payload.id;
        state.mobileView = 'editor';
      })
      .addCase(updateNote.fulfilled, (state, action) => {
        if (!action.payload) return;
        const index = state.notes.findIndex((n) => n.id === action.payload.id);
        if (index !== -1) {
          state.notes[index] = action.payload;
        }
      })
      .addCase(deleteNote.fulfilled, (state, action) => {
        if (!action.payload) return;
        const note = state.notes.find((n) => n.id === action.payload.id);
        if (note) {
          note.isDeleted = true;
          note.syncStatus = 'UNSYNCED';
        }
        if (state.activeNoteId === action.payload.id) {
          const nextActive = state.notes.find(
            (n) => !n.isDeleted && n.id !== action.payload.id
          );
          state.activeNoteId = nextActive ? nextActive.id : null;
        }
      })
      .addCase(restoreNote.fulfilled, (state, action) => {
        if (!action.payload) return;
        const index = state.notes.findIndex((n) => n.id === action.payload.id);
        if (index !== -1) {
          state.notes[index] = action.payload;
        }
      })
      .addCase(createFolder.fulfilled, (state, action) => {
        state.folders.push(action.payload);
        state.activeFolderId = action.payload.id;
      })
      .addCase(deleteFolder.fulfilled, (state, action) => {
        state.folders = state.folders.filter((f) => f.id !== action.payload);
        // Reassign affected notes in state
        state.notes.forEach((n) => {
          if (n.folderId === action.payload) {
            n.folderId = 'notes';
          }
        });
        if (state.activeFolderId === action.payload) {
          state.activeFolderId = 'notes';
        }
      });
  },
});

export const {
  setActiveNoteId,
  setActiveFolderId,
  setSearchQuery,
  toggleDarkMode,
  toggleSidebar,
  setMobileView,
  setNetworkStatus,
  syncStatusUpdated,
  conflictReconciled,
  clearConflict,
  refreshNotes,
} = notesSlice.actions;

export default notesSlice.reducer;
