import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  setNetworkStatus,
  toggleDarkMode,
  toggleSidebar,
} from '../store/notesSlice';
import { syncEngine } from '../services/syncEngine';
import { localDb } from '../db/dexieDb';
import {
  RefreshCw,
  Sun,
  Moon,
  PanelLeftClose,
  PanelLeft,
  Layers,
  Check,
  CloudOff,
  StickyNote,
  Wifi,
  WifiOff,
} from 'lucide-react';

export default function Navbar({ onToggleQueueDrawer }) {
  const dispatch = useDispatch();
  const { networkStatus, isDarkMode, sidebarVisible } = useSelector(
    (state) => state.notes
  );
  const [queueCount, setQueueCount] = useState(0);

  // Poll syncQueue count for badge updates
  useEffect(() => {
    let mounted = true;
    const updateQueueCount = async () => {
      try {
        const queue = await localDb.getSyncQueue();
        if (mounted) setQueueCount(queue.length);
      } catch (e) {
        // ignore
      }
    };

    updateQueueCount();
    const interval = setInterval(updateQueueCount, 1500);

    const unsubscribe = syncEngine.subscribe((status) => {
      dispatch(setNetworkStatus(status));
      updateQueueCount();
    });

    return () => {
      mounted = false;
      clearInterval(interval);
      unsubscribe();
    };
  }, [dispatch]);

  const handleManualSync = () => {
    syncEngine.flushSyncQueue();
  };

  const handleToggleOffline = () => {
    syncEngine.setSimulatedOffline(!networkStatus.simulatedOffline);
  };

  const isActuallyOnline = networkStatus.isOnline;

  return (
    <header className="notes-navbar">
      {/* Left: Sidebar Toggle & Brand */}
      <div className="navbar-left">
        <button
          onClick={() => dispatch(toggleSidebar())}
          className="btn-navbar-icon"
          title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
        >
          {sidebarVisible ? <PanelLeftClose size={18} /> : <PanelLeft size={18} />}
        </button>

        <div className="navbar-brand">
          <div className="brand-logo-badge">
            <StickyNote size={17} className="brand-icon-yellow" />
          </div>
          <span className="brand-title">Notes</span>
        </div>
      </div>

      {/* Right: Sync Status, Manual Sync, Theme Toggle, Queue Drawer */}
      <div className="navbar-right">
        {/* Clickable Online / Offline Toggle Button */}
        <button
          onClick={handleToggleOffline}
          className={`btn-online-toggle ${isActuallyOnline ? 'toggle-is-online' : 'toggle-is-offline'}`}
          title={
            isActuallyOnline
              ? 'Currently Online — click to simulate offline mode'
              : 'Currently Offline — click to go back online'
          }
        >
          <span className={`online-dot ${isActuallyOnline ? 'dot-green' : 'dot-orange'}`} />
          {isActuallyOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span>
            {networkStatus.isSyncing
              ? 'Syncing…'
              : isActuallyOnline
              ? 'Online'
              : networkStatus.simulatedOffline
              ? 'Sim Offline'
              : 'Offline'}
          </span>
        </button>

        {/* Sync Now button */}
        <button
          onClick={handleManualSync}
          disabled={!isActuallyOnline || networkStatus.isSyncing}
          className="btn-navbar-action"
          title="Sync now with remote server"
        >
          <RefreshCw
            size={15}
            className={networkStatus.isSyncing ? 'spin-icon' : ''}
          />
        </button>

        {/* Dark Mode Toggle */}
        <button
          onClick={() => dispatch(toggleDarkMode())}
          className="btn-navbar-action"
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
        </button>

        {/* Sync Queue Inspector Button */}
        <button
          onClick={onToggleQueueDrawer}
          className="btn-navbar-action btn-queue-action"
          title="Inspect Offline Sync Queue"
        >
          <Layers size={16} />
          {queueCount > 0 && (
            <span className="navbar-queue-badge">{queueCount}</span>
          )}
        </button>
      </div>
    </header>
  );
}
