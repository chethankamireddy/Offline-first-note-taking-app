import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { clearConflict } from '../store/notesSlice';
import { ShieldAlert, X, Check, ArrowRight } from 'lucide-react';

export default function ConflictModal() {
  const dispatch = useDispatch();
  const lastConflict = useSelector((state) => state.notes.lastConflict);

  if (!lastConflict) return null;

  return (
    <div className="conflict-toast">
      <div className="conflict-toast-icon">
        <ShieldAlert size={22} className="text-amber-500" />
      </div>
      <div className="conflict-toast-content">
        <div className="conflict-toast-title">
          Last-Write-Wins (LWW) Conflict Reconciled
        </div>
        <div className="conflict-toast-body">
          Server note <strong>&ldquo;{lastConflict.title || 'Untitled'}&rdquo;</strong> was
          newer than the incoming local version. The server state has been preserved and
          local IndexedDB has been cleanly updated.
        </div>
      </div>
      <button
        onClick={() => dispatch(clearConflict())}
        className="conflict-toast-close"
        title="Dismiss notice"
      >
        <X size={16} />
      </button>
    </div>
  );
}
