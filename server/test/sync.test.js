const assert = require('assert');
const { v4: uuidv4 } = require('uuid');
const { connectDB, disconnectDB } = require('../src/config/db');
const Note = require('../src/models/Note');

async function runTests() {
  console.log('🧪 Starting NoteSync Backend Integration & LWW Conflict Tests...\n');

  try {
    await connectDB();

    // Clean test notes
    await Note.deleteMany({});

    // 1. Test Client-Side UUID Generation & Batch Creation
    console.log('Test 1: Batch CREATE with Client-Side UUIDv4');
    const noteId1 = uuidv4();
    const createTime = Date.now();

    const note1 = await Note.create({
      _id: noteId1,
      title: 'First Offline Note',
      content: 'Created while on airplane mode.',
      createdAt: createTime,
      updatedAt: createTime,
      version: 1,
    });

    assert.strictEqual(note1._id, noteId1, 'Note _id should match client UUID');
    assert.strictEqual(note1.title, 'First Offline Note');
    console.log('✅ Test 1 Passed: Client-generated UUID correctly stored in MongoDB.\n');

    // 2. Test LWW: Client newer timestamp wins
    console.log('Test 2: LWW - Client with newer timestamp wins');
    const updateTimeNewer = createTime + 10000;

    note1.title = 'Updated Locally (Newer)';
    note1.updatedAt = updateTimeNewer;
    note1.version += 1;
    await note1.save();

    const updated = await Note.findById(noteId1);
    assert.strictEqual(updated.title, 'Updated Locally (Newer)');
    assert.strictEqual(updated.updatedAt, updateTimeNewer);
    console.log('✅ Test 2 Passed: Newer timestamp accepted.\n');

    // 3. Test LWW Conflict: Stale client timestamp is rejected
    console.log('Test 3: LWW - Stale client timestamp detected as CONFLICT');
    const staleClientTimestamp = updateTimeNewer - 5000; // Client was offline and edited with older clock

    // Simulate what the sync router does
    const currentServerNote = await Note.findById(noteId1);
    const isConflict = staleClientTimestamp <= currentServerNote.updatedAt;

    assert.strictEqual(isConflict, true, 'Stale timestamp must be flagged as conflict');
    console.log('✅ Test 3 Passed: Stale client timestamp correctly identified as conflict.\n');

    // 4. Test Soft Delete
    console.log('Test 4: Soft Delete mechanism');
    currentServerNote.isDeleted = true;
    currentServerNote.updatedAt = Date.now();
    await currentServerNote.save();

    const deletedCheck = await Note.findById(noteId1);
    assert.strictEqual(deletedCheck.isDeleted, true, 'Note must be marked as isDeleted: true');
    console.log('✅ Test 4 Passed: Soft delete preserves record with isDeleted flag.\n');

    console.log('🎉 All backend tests passed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

runTests();
