const express = require('express');
const router = express.Router();
const Note = require('../models/Note');
const { v4: uuidv4 } = require('uuid');

// GET /api/notes
router.get('/', async (req, res) => {
  try {
    const includeDeleted = req.query.includeDeleted === 'true';
    const filter = includeDeleted ? {} : { isDeleted: false };
    const notes = await Note.find(filter).sort({ updatedAt: -1 });
    res.json({ success: true, count: notes.length, notes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/notes/:id
router.get('/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }
    res.json({ success: true, note });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/notes
router.post('/', async (req, res) => {
  try {
    const { id, title, content, createdAt, updatedAt } = req.body;
    const noteId = id || uuidv4();

    const note = await Note.create({
      _id: noteId,
      title: title || '',
      content: content || '',
      createdAt: Number(createdAt) || Date.now(),
      updatedAt: Number(updatedAt) || Date.now(),
      isDeleted: false,
      version: 1,
    });

    res.status(201).json({ success: true, note });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// PUT /api/notes/:id (Single note LWW update)
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, updatedAt } = req.body;
    const clientUpdatedAt = Number(updatedAt) || Date.now();

    const note = await Note.findById(id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    // LWW Conflict check
    if (clientUpdatedAt <= note.updatedAt) {
      return res.status(409).json({
        success: false,
        error: 'Conflict: Server note is newer than client timestamp.',
        serverNote: note,
      });
    }

    note.title = title !== undefined ? title : note.title;
    note.content = content !== undefined ? content : note.content;
    note.updatedAt = clientUpdatedAt;
    note.version += 1;
    await note.save();

    res.json({ success: true, note });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// DELETE /api/notes/:id (Soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const note = await Note.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Note not found' });
    }

    note.isDeleted = true;
    note.updatedAt = Date.now();
    note.version += 1;
    await note.save();

    res.json({ success: true, message: 'Note soft deleted', noteId: note._id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
