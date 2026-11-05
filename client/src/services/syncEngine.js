import { localDb, db } from '../db/dexieDb';
import { notesApi } from '../api/notesApi';

class SyncEngine {
  constructor() {
    this.isSyncing = false;
    this.simulatedOffline = false;
    this.retryTimeoutId = null;
    this.subscribers = new Set();
    this.conflictListeners = new Set();

    // Listen to browser network status
    window.addEventListener('online', () => {
      console.log('[SyncEngine] Network restored (online event)');
      this.notifySubscribers();
      if (!this.simulatedOffline) {
        this.flushSyncQueue();
      }
    });

    window.addEventListener('offline', () => {
      console.log('[SyncEngine] Network lost (offline event)');
      this.notifySubscribers();
    });
  }

  /**
   * Subscribe to sync state changes (for UI status badges)
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Subscribe to conflict resolution events
   */
  onConflict(callback) {
    this.conflictListeners.add(callback);
    return () => this.conflictListeners.delete(callback);
  }

  notifySubscribers() {
    const status = this.getStatus();
    this.subscribers.forEach((cb) => cb(status));
  }

  notifyConflict(conflictDetail) {
    this.conflictListeners.forEach((cb) => cb(conflictDetail));
  }

  /**
   * Check whether the engine is currently allowed to make network calls.
   */
  isOnline() {
    return navigator.onLine && !this.simulatedOffline;
  }

  /**
   * Toggle simulated offline mode (for interviews & testing without killing Wi-Fi)
   */
  setSimulatedOffline(value) {
    this.simulatedOffline = value;
    console.log(`[SyncEngine] Simulated offline mode set to: ${value}`);
    this.notifySubscribers();

    if (!value && navigator.onLine) {
      // Re-connected: trigger immediate sync flush
      this.flushSyncQueue();
    }
  }

  getStatus() {
    return {
      isOnline: this.isOnline(),
      browserOnline: navigator.onLine,
      simulatedOffline: this.simulatedOffline,
      isSyncing: this.isSyncing,
    };
  }

  /**
   * Request Squashing Algorithm:
   * Combines multiple queued operations for the same note into a single, minimal operation.
   * - Multiple UPDATEs -> 1 UPDATE with latest payload.
   * - CREATE followed by UPDATEs -> 1 CREATE with latest payload.
   * - CREATE followed by DELETE -> cancelled completely (no-op on server).
   * - UPDATE followed by DELETE -> 1 DELETE.
   */
  squashQueue(rawQueue) {
    if (!rawQueue || rawQueue.length === 0) return { squashed: [], cancelledItemIds: [] };

    // Group items by noteId in chronological order
    const grouped = new Map();

    for (const item of rawQueue) {
      if (!grouped.has(item.noteId)) {
        grouped.set(item.noteId, []);
      }
      grouped.get(item.noteId).push(item);
    }

    const squashed = [];
    const cancelledItemIds = [];

    for (const [noteId, items] of grouped.entries()) {
      const allItemIds = items.map((i) => i.id);
      const firstAction = items[0].action;
      const lastItem = items[items.length - 1];
      const hasDelete = items.some((i) => i.action === 'DELETE');

      // Case 1: Created offline, then deleted offline before ever syncing
      if (firstAction === 'CREATE' && hasDelete) {
        // Safe to drop; remote server never knew about this note
        cancelledItemIds.push(...allItemIds);
        continue;
      }

      // Case 2: Existing note was deleted offline
      if (hasDelete) {
        squashed.push({
          noteId,
          action: 'DELETE',
          payload: { id: noteId, updatedAt: lastItem.payload?.updatedAt || Date.now() },
          queueItemIds: allItemIds,
          retryCount: Math.max(...items.map((i) => i.retryCount || 0)),
        });
        continue;
      }

      // Case 3: Created offline and edited multiple times
      if (firstAction === 'CREATE') {
        // Merge payloads: start with first payload, overlay subsequent updates
        const mergedPayload = items.reduce(
          (acc, cur) => ({ ...acc, ...cur.payload }),
          {}
        );
        squashed.push({
          noteId,
          action: 'CREATE',
          payload: mergedPayload,
          queueItemIds: allItemIds,
          retryCount: Math.max(...items.map((i) => i.retryCount || 0)),
        });
        continue;
      }

      // Case 4: Existing note updated multiple times
      const mergedPayload = items.reduce(
        (acc, cur) => ({ ...acc, ...cur.payload }),
        {}
      );
      squashed.push({
        noteId,
        action: 'UPDATE',
        payload: mergedPayload,
        queueItemIds: allItemIds,
        retryCount: Math.max(...items.map((i) => i.retryCount || 0)),
      });
    }

    return { squashed, cancelledItemIds };
  }

  /**
   * Main flush function: reads queue, squashes, sends batch request, reconciles conflicts.
   */
  async flushSyncQueue() {
    if (this.isSyncing) {
      console.log('[SyncEngine] Sync already in progress, skipping flush');
      return;
    }

    if (!this.isOnline()) {
      console.log('[SyncEngine] Offline; skipping sync flush');
      return;
    }

    this.isSyncing = true;
    this.notifySubscribers();

    try {
      const rawQueue = await localDb.getSyncQueue();
      if (!rawQueue || rawQueue.length === 0) {
        console.log('[SyncEngine] Sync queue is empty.');
        this.isSyncing = false;
        this.notifySubscribers();
        return;
      }

      console.log(`[SyncEngine] Processing ${rawQueue.length} raw sync queue items...`);

      // 1. Squash multiple operations on the same note
      const { squashed, cancelledItemIds } = this.squashQueue(rawQueue);

      // Clean up cancelled items (e.g. created then deleted offline)
      if (cancelledItemIds.length > 0) {
        await localDb.clearSyncQueueItems(cancelledItemIds);
        console.log(`[SyncEngine] Removed ${cancelledItemIds.length} cancelled items from queue.`);
      }

      if (squashed.length === 0) {
        this.isSyncing = false;
        this.notifySubscribers();
        return;
      }

      console.log(`[SyncEngine] Squashed into ${squashed.length} batch operations.`);

      // 2. Prepare payload for POST /api/sync/batch
      const batchPayload = squashed.map((op) => ({
        noteId: op.noteId,
        action: op.action,
        payload: op.payload,
      }));

      // 3. Dispatch batch HTTP request
      const response = await notesApi.batchSync(batchPayload);
      console.log('[SyncEngine] Batch sync response:', response);

      // 4. Reconcile results for each operation
      const processedQueueIds = [];

      for (const op of squashed) {
        const result = response.results?.find((r) => r.noteId === op.noteId);
        if (!result) continue;

        processedQueueIds.push(...op.queueItemIds);

        if (result.status === 'synced') {
          if (op.action === 'DELETE') {
            // Server confirmed deletion; now safe to hard-delete from IndexedDB
            await localDb.hardDeleteNote(op.noteId);
            console.log(`[SyncEngine] Hard-deleted note ${op.noteId} locally after server confirmation.`);
          } else {
            // Mark note as SYNCED in Dexie
            await db.notes.update(op.noteId, {
              syncStatus: 'SYNCED',
            });
          }
        } else if (result.status === 'conflict') {
          // LWW Conflict Reconciliation:
          // Server had a newer or concurrent version. Overwrite local record with server note.
          console.warn(`[SyncEngine] LWW Conflict on note ${op.noteId}. Reconciling with server version.`);
          const serverNote = result.serverNote;
          if (serverNote) {
            await localDb.putNote({
              id: serverNote._id || serverNote.id,
              title: serverNote.title,
              content: serverNote.content,
              createdAt: serverNote.createdAt,
              updatedAt: serverNote.updatedAt,
              isDeleted: !!serverNote.isDeleted,
              syncStatus: 'SYNCED',
            });

            this.notifyConflict({
              noteId: op.noteId,
              title: serverNote.title,
              serverNote,
              clientPayload: op.payload,
              message: result.message || 'LWW Conflict: Overwritten by server version.',
            });
          }
        }
      }

      // Remove processed items from syncQueue
      if (processedQueueIds.length > 0) {
        await localDb.clearSyncQueueItems(processedQueueIds);
      }

      console.log('[SyncEngine] Batch sync completed successfully.');
    } catch (error) {
      console.error('[SyncEngine] Batch sync encountered an error:', error.message);
      await this.handleSyncFailure();
    } finally {
      this.isSyncing = false;
      this.notifySubscribers();
    }
  }

  /**
   * Exponential Backoff Retry Mechanism:
   * Math.pow(2, retryCount) * 1000 ms (2s, 4s, 8s, 16s, max 30s)
   */
  async handleSyncFailure() {
    const rawQueue = await localDb.getSyncQueue();
    if (!rawQueue || rawQueue.length === 0) return;

    let maxRetry = 0;
    for (const item of rawQueue) {
      await localDb.incrementRetry(item.id);
      maxRetry = Math.max(maxRetry, (item.retryCount || 0) + 1);
    }

    const backoffMs = Math.min(Math.pow(2, maxRetry) * 1000, 30000);
    console.warn(`[SyncEngine] Retrying sync with exponential backoff in ${backoffMs / 1000}s (retry #${maxRetry})`);

    if (this.retryTimeoutId) clearTimeout(this.retryTimeoutId);
    this.retryTimeoutId = setTimeout(() => {
      if (this.isOnline()) {
        this.flushSyncQueue();
      }
    }, backoffMs);
  }

  /**
   * Helper to write a local mutation and immediately trigger or queue sync.
   */
  async recordMutation(noteId, action, payload) {
    // 1. Write to sync queue table in Dexie
    await localDb.enqueueSync(noteId, action, payload);

    // 2. If online, attempt background sync immediately
    if (this.isOnline()) {
      // Small debounce to let consecutive typing settle
      if (this.syncDebounceTimer) clearTimeout(this.syncDebounceTimer);
      this.syncDebounceTimer = setTimeout(() => {
        this.flushSyncQueue();
      }, 500);
    } else {
      console.log(`[SyncEngine] Queued ${action} for note ${noteId} (offline)`);
      this.notifySubscribers();
    }
  }
}

export const syncEngine = new SyncEngine();
