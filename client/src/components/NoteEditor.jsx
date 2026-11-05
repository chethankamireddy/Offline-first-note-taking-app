import React, { useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  updateNote,
  deleteNote,
  togglePinNote,
  moveNoteToFolder,
} from '../store/notesSlice';
import { notesApi } from '../api/notesApi';
import { syncEngine } from '../services/syncEngine';
import {
  Bold,
  Italic,
  Strikethrough,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  CheckSquare,
  Pin,
  Trash2,
  Folder,
  Zap,
  CheckCircle,
  Clock,
  AlertTriangle,
  ChevronDown,
  Paperclip,
  Image as ImageIcon,
  X,
} from 'lucide-react';

export default function NoteEditor() {
  const dispatch = useDispatch();
  const { notes, activeNoteId, folders } = useSelector((state) => state.notes);
  const activeNote = notes.find((n) => n.id === activeNoteId);

  const [conflictSimulating, setConflictSimulating] = useState(false);
  const [conflictNotice, setConflictNotice] = useState(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  if (!activeNote) {
    return (
      <main className="apple-editor-empty">
        <div className="empty-content">
          <h3>No Note Selected</h3>
          <p>Select a note from the list or create a new one.</p>
        </div>
      </main>
    );
  }

  const handleTitleChange = (e) => {
    dispatch(updateNote({ id: activeNote.id, title: e.target.value }));
  };

  const handleContentChange = (e) => {
    dispatch(updateNote({ id: activeNote.id, content: e.target.value }));
  };

  const handleTogglePin = () => {
    dispatch(togglePinNote(activeNote.id));
  };

  const handleDelete = () => {
    if (confirm('Delete this note? It will be moved to Recently Deleted.')) {
      dispatch(deleteNote(activeNote.id));
    }
  };

  const handleFolderChange = (e) => {
    dispatch(
      moveNoteToFolder({ noteId: activeNote.id, folderId: e.target.value })
    );
  };

  // Rich-text / Markdown helper insertions
  const insertFormatting = (prefix, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = activeNote.content || '';
    const selected = text.substring(start, end);

    const replacement = `${prefix}${selected || 'text'}${suffix}`;
    const newContent = text.substring(0, start) + replacement + text.substring(end);

    dispatch(updateNote({ id: activeNote.id, content: newContent }));

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + (selected ? selected.length : 4)
      );
    }, 0);
  };

  const insertChecklist = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const text = activeNote.content || '';
    const lastNewline = text.lastIndexOf('\n', start - 1);
    const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;

    const currentLine = text.substring(lineStart, start);
    let newContent;

    if (currentLine.startsWith('- [ ] ') || currentLine.startsWith('- [x] ')) {
      newContent = text.substring(0, lineStart) + currentLine.replace(/- \[[ x]\] /, '') + text.substring(start);
    } else {
      newContent = text.substring(0, start) + '\n- [ ] ' + text.substring(start);
    }

    dispatch(updateNote({ id: activeNote.id, content: newContent }));
  };

  // Keyboard navigation & smart list/checklist continuation
  const handleKeyDown = (e) => {
    // 1. Cmd/Ctrl + B -> Bold
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      insertFormatting('**', '**');
      return;
    }
    // 2. Cmd/Ctrl + I -> Italic
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      insertFormatting('*', '*');
      return;
    }
    // 3. Tab key -> 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const val = textarea.value;
      const newVal = val.substring(0, start) + '  ' + val.substring(end);
      dispatch(updateNote({ id: activeNote.id, content: newVal }));
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
      return;
    }
    // 4. Enter key inside checklist or bullet list
    if (e.key === 'Enter') {
      const textarea = textareaRef.current;
      const start = textarea.selectionStart;
      const val = textarea.value;
      const lastNewline = val.lastIndexOf('\n', start - 1);
      const lineStart = lastNewline === -1 ? 0 : lastNewline + 1;
      const currentLine = val.substring(lineStart, start);

      // Checklist continue
      if (currentLine.startsWith('- [ ] ') || currentLine.startsWith('- [x] ')) {
        e.preventDefault();
        if (currentLine.trim() === '- [ ]' || currentLine.trim() === '- [x]') {
          const newVal = val.substring(0, lineStart) + val.substring(start);
          dispatch(updateNote({ id: activeNote.id, content: newVal }));
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart;
          }, 0);
        } else {
          const newVal = val.substring(0, start) + '\n- [ ] ' + val.substring(start);
          dispatch(updateNote({ id: activeNote.id, content: newVal }));
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + 7;
          }, 0);
        }
        return;
      }

      // Bullet list continue
      if (currentLine.startsWith('- ') && !currentLine.startsWith('- [')) {
        e.preventDefault();
        if (currentLine.trim() === '-') {
          const newVal = val.substring(0, lineStart) + val.substring(start);
          dispatch(updateNote({ id: activeNote.id, content: newVal }));
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = lineStart;
          }, 0);
        } else {
          const newVal = val.substring(0, start) + '\n- ' + val.substring(start);
          dispatch(updateNote({ id: activeNote.id, content: newVal }));
          setTimeout(() => {
            textarea.selectionStart = textarea.selectionEnd = start + 3;
          }, 0);
        }
        return;
      }
    }
  };

  // Attachment controls: upload image and store as Base64 data URL
  const handleAttachmentClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const base64Data = reader.result;
      const attachmentMarkdown = `\n\n![${file.name}](${base64Data})\n`;
      const newContent = (activeNote.content || '') + attachmentMarkdown;
      dispatch(updateNote({ id: activeNote.id, content: newContent }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removeAttachment = (fullMatch) => {
    const newContent = (activeNote.content || '').replace(fullMatch, '').trim();
    dispatch(updateNote({ id: activeNote.id, content: newContent }));
  };

  // Interactive Checklist click handler in rendered preview
  const handleToggleChecklistItem = (lineIndex) => {
    const lines = (activeNote.content || '').split('\n');
    if (lines[lineIndex] !== undefined) {
      if (lines[lineIndex].startsWith('- [ ] ')) {
        lines[lineIndex] = lines[lineIndex].replace('- [ ] ', '- [x] ');
      } else if (lines[lineIndex].startsWith('- [x] ')) {
        lines[lineIndex] = lines[lineIndex].replace('- [x] ', '- [ ] ');
      }
      dispatch(updateNote({ id: activeNote.id, content: lines.join('\n') }));
    }
  };

  // Conflict simulator
  const handleSimulateConflict = async () => {
    try {
      setConflictSimulating(true);
      setConflictNotice(null);
      await notesApi.simulateServerConflict(activeNote.id);
      setConflictNotice(
        'Server version updated with future timestamp! Edit this note or click "Sync Now" to observe Last-Write-Wins conflict resolution.'
      );
      if (syncEngine.isOnline()) {
        setTimeout(() => syncEngine.flushSyncQueue(), 800);
      }
    } catch (err) {
      setConflictNotice(`Conflict error: ${err.message}`);
    } finally {
      setConflictSimulating(false);
    }
  };

  const formattedDate = new Date(activeNote.updatedAt || Date.now()).toLocaleDateString(
    'en-US',
    {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }
  );

  const wordCount = (activeNote.content || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const charCount = (activeNote.content || '').length;

  // Extract checklist items
  const contentLines = (activeNote.content || '').split('\n');
  const checklistLines = contentLines
    .map((line, idx) => ({ line, idx }))
    .filter(
      ({ line }) => line.startsWith('- [ ] ') || line.startsWith('- [x] ')
    );

  // Extract attachments
  const imageRegex = /!\[(.*?)\]\((.*?)\)/g;
  const attachments = [];
  let match;
  while ((match = imageRegex.exec(activeNote.content || '')) !== null) {
    attachments.push({ alt: match[1], url: match[2], fullMatch: match[0] });
  }

  return (
    <main className="apple-note-editor">
      {/* Apple Notes Top Toolbar */}
      <div className="editor-top-toolbar">
        <div className="toolbar-left-group">
          {/* Text formatting controls */}
          <button
            onClick={() => insertFormatting('# ', '')}
            className="toolbar-btn"
            title="Heading 1"
          >
            <Heading1 size={17} />
          </button>
          <button
            onClick={() => insertFormatting('## ', '')}
            className="toolbar-btn"
            title="Heading 2"
          >
            <Heading2 size={17} />
          </button>
          <div className="toolbar-separator" />
          <button
            onClick={() => insertFormatting('**', '**')}
            className="toolbar-btn"
            title="Bold (Cmd+B)"
          >
            <Bold size={16} />
          </button>
          <button
            onClick={() => insertFormatting('*', '*')}
            className="toolbar-btn"
            title="Italic (Cmd+I)"
          >
            <Italic size={16} />
          </button>
          <button
            onClick={() => insertFormatting('~~', '~~')}
            className="toolbar-btn"
            title="Strikethrough"
          >
            <Strikethrough size={16} />
          </button>
          <div className="toolbar-separator" />
          <button
            onClick={insertChecklist}
            className="toolbar-btn btn-checklist"
            title="Insert Checklist"
          >
            <CheckSquare size={16} />
          </button>
          <button
            onClick={() => insertFormatting('- ')}
            className="toolbar-btn"
            title="Bulleted List"
          >
            <List size={16} />
          </button>
          <button
            onClick={() => insertFormatting('1. ')}
            className="toolbar-btn"
            title="Numbered List"
          >
            <ListOrdered size={16} />
          </button>
          <div className="toolbar-separator" />

          {/* Attachment button */}
          <button
            onClick={handleAttachmentClick}
            className="toolbar-btn btn-attachment"
            title="Attach Image or Photo"
          >
            <Paperclip size={16} />
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            style={{ display: 'none' }}
          />
        </div>

        <div className="toolbar-right-group">
          {/* Folder picker */}
          <div className="folder-select-wrapper" title="Move note to folder">
            <Folder size={14} className="folder-select-icon" />
            <select
              value={activeNote.folderId || 'notes'}
              onChange={handleFolderChange}
              className="folder-dropdown"
            >
              <option value="notes">Notes</option>
              {folders
                .filter((f) => f.id !== 'notes')
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
            <ChevronDown size={12} className="folder-chevron" />
          </div>

          {/* Pin Toggle */}
          <button
            onClick={handleTogglePin}
            className={`toolbar-btn ${
              activeNote.isPinned ? 'toolbar-btn-pinned' : ''
            }`}
            title={activeNote.isPinned ? 'Unpin note' : 'Pin note'}
          >
            <Pin
              size={16}
              fill={activeNote.isPinned ? 'currentColor' : 'none'}
            />
          </button>

          {/* Simulate Conflict */}
          <button
            onClick={handleSimulateConflict}
            disabled={conflictSimulating}
            className="toolbar-btn btn-conflict-sim"
            title="Simulate remote concurrent edit on server (tests LWW)"
          >
            <Zap size={15} />
          </button>

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="toolbar-btn btn-delete-note"
            title="Delete note"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Conflict simulation notification banner */}
      {conflictNotice && (
        <div className="apple-conflict-banner">
          <AlertTriangle size={16} />
          <span>{conflictNotice}</span>
          <button
            onClick={() => setConflictNotice(null)}
            className="banner-close-btn"
          >
            ×
          </button>
        </div>
      )}

      {/* Note Content Area */}
      <div className="editor-scroll-area">
        <div className="editor-inner-content">
          {/* Apple Notes centered date header */}
          <div className="apple-note-date-header">{formattedDate}</div>

          {/* Note Title Input */}
          <input
            type="text"
            className="apple-note-title-input"
            placeholder="Title"
            value={activeNote.title}
            onChange={handleTitleChange}
          />

          {/* Interactive Checklists Strip (if note contains checklists) */}
          {checklistLines.length > 0 && (
            <div className="interactive-checklist-panel">
              <div className="checklist-panel-title">Checklist Items:</div>
              {checklistLines.map(({ line, idx }) => {
                const isChecked = line.startsWith('- [x] ');
                const label = line.replace(/- \[[ x]\] /, '');
                return (
                  <div
                    key={idx}
                    onClick={() => handleToggleChecklistItem(idx)}
                    className={`checklist-item-row ${
                      isChecked ? 'checklist-item-checked' : ''
                    }`}
                  >
                    <div
                      className={`checklist-circle ${
                        isChecked ? 'circle-checked' : ''
                      }`}
                    >
                      {isChecked && <div className="circle-inner-dot" />}
                    </div>
                    <span className="checklist-item-label">{label || 'Empty item'}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Render Attached Images */}
          {attachments.length > 0 && (
            <div className="apple-attachments-grid">
              {attachments.map((att, i) => (
                <div key={i} className="attachment-card">
                  <img src={att.url} alt={att.alt} className="attachment-thumb" />
                  <div className="attachment-info">
                    <span className="attachment-name">{att.alt || 'Attached image'}</span>
                    <button
                      onClick={() => removeAttachment(att.fullMatch)}
                      className="btn-remove-attachment"
                      title="Remove attachment"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Note Body Textarea */}
          <textarea
            ref={textareaRef}
            className="apple-note-body-textarea"
            placeholder="Type your note here..."
            value={activeNote.content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      {/* Editor Status Footer */}
      <div className="apple-editor-footer">
        <span className="footer-meta">
          {wordCount} words • {charCount} characters
        </span>

        <span className="footer-sync">
          {activeNote.syncStatus === 'SYNCED' ? (
            <span className="sync-status-synced">
              <CheckCircle size={13} /> Synced to iCloud
            </span>
          ) : (
            <span className="sync-status-unsynced">
              <Clock size={13} /> Saved locally
            </span>
          )}
        </span>
      </div>
    </main>
  );
}
