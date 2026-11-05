const express = require('express');
const router = express.Router();
const Note = require('../models/Note');

/**
 * POST /api/sync/batch
 * Handles batch sync operations (CREATE, UPDATE, DELETE) with LWW conflict resolution.
 */
router.post('/batch', async (req, res) => {
  try {
    const operations = Array.isArray(req.body) ? req.body : req.body.operations;

    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body. Expected an array of operations or { operations: [] }',
      });
    }

    const results = [];
    let conflictsCount = 0;

    for (const op of operations) {
      const { noteId, action, payload } = op;
      const targetId = noteId || payload?.id;

      if (!targetId) {
        results.push({
          noteId: null,
          status: 'error',
          error: 'Missing noteId in operation',
        });
        continue;
      }

      const clientUpdatedAt = Number(payload?.updatedAt) || Date.now();

      if (action === 'CREATE') {
        const existing = await Note.findById(targetId);
        if (!existing) {
          const newNote = await Note.create({
            _id: targetId,
            userId: payload.userId || 'default-user',
            title: payload.title || '',
            content: payload.content || '',
            folderId: payload.folderId || 'notes',
            isPinned: !!payload.isPinned,
            createdAt: Number(payload.createdAt) || Date.now(),
            updatedAt: clientUpdatedAt,
            isDeleted: !!payload.isDeleted,
            version: 1,
          });
          results.push({
            noteId: targetId,
            action: 'CREATE',
            status: 'synced',
            note: newNote,
          });
        } else {
          // Note already exists on server; apply Last-Write-Wins
          if (clientUpdatedAt > existing.updatedAt) {
            existing.title = payload.title ?? existing.title;
            existing.content = payload.content ?? existing.content;
            if (payload.folderId !== undefined) existing.folderId = payload.folderId;
            if (payload.isPinned !== undefined) existing.isPinned = !!payload.isPinned;
            existing.updatedAt = clientUpdatedAt;
            existing.isDeleted = !!payload.isDeleted;
            existing.version += 1;
            await existing.save();

            results.push({
              noteId: targetId,
              action: 'CREATE_MERGED',
              status: 'synced',
              note: existing,
            });
          } else {
            conflictsCount++;
            results.push({
              noteId: targetId,
              action: 'CREATE',
              status: 'conflict',
              serverNote: existing,
              message: 'LWW Conflict: Server has a newer or equal version.',
            });
          }
        }
      } else if (action === 'UPDATE') {
        const existing = await Note.findById(targetId);

        if (!existing) {
          // If note is missing on server, create it
          const createdNote = await Note.create({
            _id: targetId,
            userId: payload?.userId || 'default-user',
            title: payload?.title || '',
            content: payload?.content || '',
            folderId: payload?.folderId || 'notes',
            isPinned: !!payload?.isPinned,
            createdAt: Number(payload?.createdAt) || Date.now(),
            updatedAt: clientUpdatedAt,
            isDeleted: !!payload?.isDeleted,
            version: 1,
          });
          results.push({
            noteId: targetId,
            action: 'UPDATE_CREATED',
            status: 'synced',
            note: createdNote,
          });
        } else {
          // Last-Write-Wins (LWW) evaluation
          if (clientUpdatedAt > existing.updatedAt) {
            existing.title = payload?.title !== undefined ? payload.title : existing.title;
            existing.content = payload?.content !== undefined ? payload.content : existing.content;
            if (payload?.folderId !== undefined) existing.folderId = payload.folderId;
            if (payload?.isPinned !== undefined) existing.isPinned = !!payload.isPinned;
            existing.updatedAt = clientUpdatedAt;
            if (payload?.isDeleted !== undefined) {
              existing.isDeleted = !!payload.isDeleted;
            }
            existing.version += 1;
            await existing.save();

            results.push({
              noteId: targetId,
              action: 'UPDATE',
              status: 'synced',
              note: existing,
            });
          } else {
            conflictsCount++;
            results.push({
              noteId: targetId,
              action: 'UPDATE',
              status: 'conflict',
              serverNote: existing,
              clientUpdatedAt,
              serverUpdatedAt: existing.updatedAt,
              message: 'LWW Conflict: Server note is newer than or concurrent with client note.',
            });
          }
        }
      } else if (action === 'DELETE') {
        const existing = await Note.findById(targetId);
        if (existing) {
          // Soft delete in database
          existing.isDeleted = true;
          existing.updatedAt = Math.max(clientUpdatedAt, Date.now());
          existing.version += 1;
          await existing.save();
        }
        results.push({
          noteId: targetId,
          action: 'DELETE',
          status: 'synced',
        });
      } else {
        results.push({
          noteId: targetId,
          status: 'error',
          error: `Unsupported action: ${action}`,
        });
      }
    }

    // Return 200 with operation breakdown (or 207 Multi-Status)
    res.json({
      success: true,
      conflictsCount,
      totalOperations: operations.length,
      results,
      syncedAt: Date.now(),
    });
  } catch (error) {
    console.error('[Sync API] Batch error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error during sync batch',
    });
  }
});

/**
 * GET /api/sync/pull?since=<timestamp>
 * Fetch changes made on the server since a given timestamp (bidirectional sync).
 */
router.get('/pull', async (req, res) => {
  try {
    const since = Number(req.query.since) || 0;
    const notes = await Note.find({
      updatedAt: { $gt: since },
    }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      notes,
      serverTime: Date.now(),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/sync/simulate-conflict/:id
 * Development helper endpoint to intentionally simulate a remote edit on the server
 * so users can test conflict detection and resolution.
 */
router.post('/simulate-conflict/:id', async (req, res) => {
  try {
    const { id } = req.params;
    let note = await Note.findById(id);

    const futureTimestamp = Date.now() + 5000; // 5 seconds ahead

    if (!note) {
      note = await Note.create({
        _id: id,
        title: 'Conflicting Remote Note',
        content: 'This edit was made remotely on another device (e.g. your phone).',
        updatedAt: futureTimestamp,
        version: 2,
      });
    } else {
      note.title = `${note.title} (Edited on Server)`;
      note.content = `${note.content}\n\n[Remote edit via Cloud Server at ${new Date(futureTimestamp).toLocaleTimeString()}]`;
      note.updatedAt = futureTimestamp;
      note.version += 1;
      await note.save();
    }

    res.json({
      success: true,
      message: 'Simulated remote edit committed on server with future timestamp.',
      note,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
