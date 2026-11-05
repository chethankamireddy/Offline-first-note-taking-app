const BASE_URL = '/api';

export const notesApi = {
  /**
   * Health check to detect if the backend server is reachable.
   */
  async checkServerHealth() {
    try {
      const res = await fetch(`${BASE_URL}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  /**
   * Fetch all remote notes from MongoDB.
   */
  async fetchRemoteNotes(includeDeleted = false) {
    const res = await fetch(`${BASE_URL}/notes?includeDeleted=${includeDeleted}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch notes`);
    return await res.json();
  },

  /**
   * Send batch of squashed operations to the server.
   * @param {Array} operations - [{ noteId, action, payload }]
   */
  async batchSync(operations) {
    const res = await fetch(`${BASE_URL}/sync/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ operations }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const err = new Error(errData.error || `Batch sync failed with status ${res.status}`);
      err.status = res.status;
      err.data = errData;
      throw err;
    }

    return await res.json();
  },

  /**
   * Pull changes from server since last sync timestamp.
   */
  async pullChanges(since = 0) {
    const res = await fetch(`${BASE_URL}/sync/pull?since=${since}`);
    if (!res.ok) throw new Error(`Failed to pull changes: ${res.status}`);
    return await res.json();
  },

  /**
   * Dev helper: Simulates a conflict on the server by altering the note with a future timestamp.
   */
  async simulateServerConflict(noteId) {
    const res = await fetch(`${BASE_URL}/sync/simulate-conflict/${noteId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to simulate server conflict');
    return await res.json();
  },
};
