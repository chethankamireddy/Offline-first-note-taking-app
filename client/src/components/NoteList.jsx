import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  setActiveNoteId,
  createNote,
  setSearchQuery,
  togglePinNote,
  restoreNote,
} from '../store/notesSlice';
import {
  Search,
  SquarePen,
  Pin,
  Clock,
  CheckCircle,
  Trash2,
  Undo2,
  FileText,
} from 'lucide-react';

export default function NoteList() {
  const dispatch = useDispatch();
  const { notes, activeNoteId, activeFolderId, folders, searchQuery } =
    useSelector((state) => state.notes);

  // Determine folder title
  let currentFolderTitle = 'Notes';
  if (activeFolderId === 'all') currentFolderTitle = 'All Notes';
  else if (activeFolderId === 'trash') currentFolderTitle = 'Recently Deleted';
  else {
    const custom = folders.find((f) => f.id === activeFolderId);
    if (custom) currentFolderTitle = custom.name;
  }

  // Filter notes by active folder and search query
  const folderNotes = notes.filter((note) => {
    if (activeFolderId === 'all') return !note.isDeleted;
    if (activeFolderId === 'trash') return note.isDeleted;
    return !note.isDeleted && (note.folderId || 'notes') === activeFolderId;
  });

  const filteredNotes = folderNotes.filter((note) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchTitle = (note.title || '').toLowerCase().includes(q);
    const matchContent = (note.content || '').toLowerCase().includes(q);
    return matchTitle || matchContent;
  });

  // Separate into Pinned and Other notes
  const pinnedNotes = filteredNotes.filter((n) => n.isPinned);
  const regularNotes = filteredNotes.filter((n) => !n.isPinned);

  const handleCreateNote = () => {
    dispatch(createNote({ title: 'New Note', content: '' }));
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();

    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' });
    }
    return date.toLocaleDateString([], { month: 'numeric', day: 'numeric', year: '2-digit' });
  };

  // Strip markdown formatting for clean snippet preview
  const getPreviewText = (content) => {
    if (!content) return 'No additional text';
    return content
      .replace(/#+\s/g, '')
      .replace(/- \[[ x]\]\s/g, '')
      .replace(/[*_~`]/g, '')
      .trim() || 'No additional text';
  };

  const renderNoteCard = (note) => {
    const isSelected = note.id === activeNoteId;

    return (
      <div
        key={note.id}
        onClick={() => dispatch(setActiveNoteId(note.id))}
        className={`apple-note-card ${isSelected ? 'note-card-selected' : ''}`}
      >
        <div className="note-card-header-row">
          <h4 className="note-card-title">
            {note.title.trim() ? note.title : 'New Note'}
          </h4>
          {note.isPinned && (
            <Pin size={12} className="pin-icon-badge" fill="currentColor" />
          )}
        </div>

        <div className="note-card-meta-row">
          <span className="note-card-date">{formatDate(note.updatedAt)}</span>
          <span className="note-card-snippet">{getPreviewText(note.content)}</span>
        </div>

        <div className="note-card-bottom-row">
          {note.syncStatus === 'SYNCED' ? (
            <span className="sync-dot sync-dot-synced" title="Synced to iCloud" />
          ) : (
            <span className="sync-dot sync-dot-unsynced" title="Local changes (pending sync)" />
          )}

          {activeFolderId === 'trash' && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                dispatch(restoreNote(note.id));
              }}
              className="btn-restore"
              title="Restore note"
            >
              <Undo2 size={12} />
              <span>Restore</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="apple-notes-list">
      {/* Header */}
      <div className="notes-list-header">
        <div className="notes-list-title-row">
          <h2>{currentFolderTitle}</h2>
          {activeFolderId !== 'trash' && (
            <button
              onClick={handleCreateNote}
              className="btn-compose-note"
              title="New Note (Cmd+N)"
            >
              <SquarePen size={18} />
            </button>
          )}
        </div>

        {/* Apple Rounded Search Pill */}
        <div className="apple-search-container">
          <Search size={15} className="apple-search-icon" />
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => dispatch(setSearchQuery(e.target.value))}
            className="apple-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => dispatch(setSearchQuery(''))}
              className="search-clear-btn"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Note Cards Scrollable Area */}
      <div className="notes-list-scroll">
        {filteredNotes.length === 0 ? (
          <div className="notes-empty-state">
            <FileText size={38} className="empty-state-icon" />
            <p>
              {searchQuery
                ? 'No matching notes'
                : activeFolderId === 'trash'
                ? 'No deleted notes'
                : 'No Notes'}
            </p>
          </div>
        ) : (
          <>
            {/* Pinned Section */}
            {pinnedNotes.length > 0 && (
              <div className="notes-group">
                <div className="group-heading">PINNED</div>
                {pinnedNotes.map(renderNoteCard)}
              </div>
            )}

            {/* Regular Notes Section */}
            {regularNotes.length > 0 && (
              <div className="notes-group">
                {pinnedNotes.length > 0 && <div className="group-heading">NOTES</div>}
                {regularNotes.map(renderNoteCard)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="notes-list-footer">
        <span>{filteredNotes.length} Notes</span>
      </div>
    </section>
  );
}
