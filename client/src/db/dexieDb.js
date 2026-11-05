import Dexie from 'dexie';

export const db = new Dexie('NoteSyncDB');

// Define database schema
// version 1: initial schema
db.version(1).stores({
  notes: 'id, title, syncStatus, isDeleted, updatedAt, createdAt',
  syncQueue: '++id, noteId, action, retryCount',
});

// version 2: Apple Notes layout with folders and pinning
db.version(2).stores({
  notes: 'id, title, folderId, isPinned, syncStatus, isDeleted, updatedAt, createdAt',
  folders: 'id, name, createdAt',
  syncQueue: '++id, noteId, action, retryCount',
});

// Helper database functions for robust local operations
export const localDb = {
  // Get all active (non-deleted) notes
  async getActiveNotes() {
    const all = await db.notes.toArray();
    return all
      .filter((note) => !note.isDeleted)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  // Get all notes including deleted (for sync and trash view)
  async getAllNotes() {
    const all = await db.notes.toArray();
    return all.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  },

  // Get note by id
  async getNote(id) {
    return await db.notes.get(id);
  },

  // Upsert note locally
  async putNote(note) {
    const sanitized = {
      folderId: 'notes',
      isPinned: false,
      ...note,
    };
    return await db.notes.put(sanitized);
  },

  // Toggle pin
  async togglePin(id, isPinned) {
    return await db.notes.update(id, {
      isPinned,
      updatedAt: Date.now(),
      syncStatus: 'UNSYNCED',
    });
  },

  // Move note to folder
  async moveToFolder(id, folderId) {
    return await db.notes.update(id, {
      folderId,
      updatedAt: Date.now(),
      syncStatus: 'UNSYNCED',
    });
  },

  // Soft delete note locally
  async softDeleteNote(id) {
    return await db.notes.update(id, {
      isDeleted: true,
      updatedAt: Date.now(),
      syncStatus: 'UNSYNCED',
    });
  },

  // Hard delete note from local storage after remote sync confirmed
  async hardDeleteNote(id) {
    return await db.notes.delete(id);
  },

  // Folder operations
  async getAllFolders() {
    const folders = await db.folders.toArray();
    return folders.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  },

  async putFolder(folder) {
    return await db.folders.put(folder);
  },

  async deleteFolder(id) {
    // Reassign notes in this folder to default 'notes' folder
    const notesInFolder = await db.notes.where('folderId').equals(id).toArray().catch(() => []);
    for (const note of notesInFolder) {
      await db.notes.update(note.id, { folderId: 'notes' });
    }
    return await db.folders.delete(id);
  },

  // Enqueue a sync job
  async enqueueSync(noteId, action, payload) {
    return await db.syncQueue.add({
      noteId,
      action,
      payload,
      retryCount: 0,
      timestamp: Date.now(),
    });
  },

  // Retrieve all queued sync actions
  async getSyncQueue() {
    return await db.syncQueue.toArray();
  },

  // Remove specific sync queue entry
  async removeSyncQueueItem(id) {
    return await db.syncQueue.delete(id);
  },

  // Clear processed sync queue items by IDs
  async clearSyncQueueItems(ids) {
    return await db.syncQueue.bulkDelete(ids);
  },

  // Increment retry count for an item
  async incrementRetry(id) {
    const item = await db.syncQueue.get(id);
    if (item) {
      await db.syncQueue.update(id, {
        retryCount: (item.retryCount || 0) + 1,
      });
    }
  },
};
