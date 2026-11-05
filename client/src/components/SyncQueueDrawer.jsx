import React, { useState, useEffect } from 'react';
import { localDb } from '../db/dexieDb';
import { syncEngine } from '../services/syncEngine';
import {
  X,
  Layers,
  ArrowRight,
  RefreshCw,
  GitMerge,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';

export default function SyncQueueDrawer({ isOpen, onClose }) {
  const [queue, setQueue] = useState([]);
  const [activeTab, setActiveTab] = useState('raw'); // 'raw' | 'squashed'
  const [loading, setLoading] = useState(false);

  const fetchQueue = async () => {
    try {
      const items = await localDb.getSyncQueue();
      setQueue(items);
    } catch (err) {
      console.error('Error fetching sync queue:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchQueue();
      const interval = setInterval(fetchQueue, 1000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const { squashed, cancelledItemIds } = syncEngine.squashQueue(queue);

  const handleFlush = async () => {
    setLoading(true);
    await syncEngine.flushSyncQueue();
    await fetchQueue();
    setLoading(false);
  };

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-content" onClick={(e) => e.stopPropagation()}>
        {/* Drawer Header */}
        <div className="drawer-header">
          <div className="drawer-title-group">
            <Layers className="text-brand-blue" size={20} />
            <h3>IndexedDB Sync Queue</h3>
            <span className="queue-count-pill">{queue.length} pending</span>
          </div>
          <button onClick={onClose} className="drawer-close-btn">
            <X size={20} />
          </button>
        </div>

        {/* Concept Explainer */}
        <div className="drawer-explainer">
          <p>
            <strong>How it works:</strong> All offline writes are enqueued in Dexie's{' '}
            <code>syncQueue</code> table. When network reconnects, operations are{' '}
            <strong>squashed</strong> and dispatched in a single batch request to{' '}
            <code>POST /api/sync/batch</code>.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="drawer-tabs">
          <button
            className={`drawer-tab ${activeTab === 'raw' ? 'active' : ''}`}
            onClick={() => setActiveTab('raw')}
          >
            Raw Queue ({queue.length})
          </button>
          <button
            className={`drawer-tab ${activeTab === 'squashed' ? 'active' : ''}`}
            onClick={() => setActiveTab('squashed')}
          >
            <GitMerge size={14} />
            <span>Squashed Batch ({squashed.length})</span>
          </button>
        </div>

        {/* Drawer Body */}
        <div className="drawer-body">
          {activeTab === 'raw' ? (
            queue.length === 0 ? (
              <div className="empty-queue-view">
                <CheckCircle2 size={40} className="text-green-500" />
                <h4>Queue is empty!</h4>
                <p>All client changes have been synchronized with the remote database.</p>
              </div>
            ) : (
              <div className="queue-list">
                {queue.map((item) => (
                  <div key={item.id} className="queue-item-card">
                    <div className="queue-item-header">
                      <span className={`action-badge action-${item.action.toLowerCase()}`}>
                        {item.action}
                      </span>
                      <span className="queue-item-id">Queue ID #{item.id}</span>
                      {item.retryCount > 0 && (
                        <span className="retry-badge">Retries: {item.retryCount}</span>
                      )}
                    </div>

                    <div className="queue-item-meta">
                      <span>Note ID: <code>{item.noteId.slice(0, 12)}...</code></span>
                      <span>
                        {new Date(item.timestamp || Date.now()).toLocaleTimeString()}
                      </span>
                    </div>

                    <pre className="payload-preview">
                      {JSON.stringify(item.payload, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Squashed View */
            <div className="squashed-view">
              <div className="squash-notice">
                {squashed.length === 0 ? (
                  <p>No operations to squash.</p>
                ) : (
                  <p>
                    ⚡ <strong>Request Squashing in Action:</strong> {queue.length}{' '}
                    raw operations consolidated into {squashed.length} HTTP request(s).{' '}
                    {cancelledItemIds.length > 0 && (
                      <span className="text-amber-500">
                        ({cancelledItemIds.length} offline-created & deleted notes safely cancelled).
                      </span>
                    )}
                  </p>
                )}
              </div>

              {squashed.map((op, idx) => (
                <div key={idx} className="squashed-card">
                  <div className="squashed-card-header">
                    <span className={`action-badge action-${op.action.toLowerCase()}`}>
                      {op.action}
                    </span>
                    <span className="squashed-note-id">Note: {op.noteId.slice(0, 10)}...</span>
                    <span className="squash-count-badge">
                      Squashed from {op.queueItemIds.length} events
                    </span>
                  </div>

                  <div className="squashed-payload">
                    <div className="payload-title">Consolidated Payload for Server:</div>
                    <pre>{JSON.stringify(op.payload, null, 2)}</pre>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="drawer-footer">
          <button
            onClick={handleFlush}
            disabled={loading || queue.length === 0 || !syncEngine.isOnline()}
            className="btn btn-primary btn-flush"
          >
            <RefreshCw size={16} className={loading ? 'spin-icon' : ''} />
            <span>Flush Queue Now</span>
          </button>
        </div>
      </div>
    </div>
  );
}
