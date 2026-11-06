import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Cloud,
  Folder,
  FolderPlus,
  KeyRound,
  RefreshCw,
  Search,
  UserCheck,
  X
} from 'lucide-react';
import {
  DriveFolderItem,
  GoogleDriveAuth,
  GoogleDriveClient
} from '../sync/googleDriveSync';
import { useBudget } from '../state/BudgetContext';

export const GoogleDriveFolderPickerModal: React.FC = () => {
  const {
    isDrivePickerOpen,
    drivePickerUser,
    closeDrivePicker,
    completeGoogleDriveFolderSelection,
    startGoogleDriveLinkFlow
  } = useBudget();

  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string; name: string }>>([
    { id: 'root', name: 'My Drive' }
  ]);
  const [sharedTab, setSharedTab] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [folders, setFolders] = useState<DriveFolderItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<DriveFolderItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState('Weekly Budget');
  const [creating, setCreating] = useState(false);

  const reqSeqRef = useRef(0);
  const currentParent = breadcrumbs[breadcrumbs.length - 1];

  // Debounce folder search query by 250ms
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // Reset breadcrumbs, folders, and selection when opening or switching Google accounts
  useEffect(() => {
    if (isDrivePickerOpen) {
      setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
      setSharedTab(false);
      setSearchQuery('');
      setDebouncedQuery('');
      setFolders([]);
      setSelectedFolder(null);
      setShowCreateNew(false);
      setError(null);
    }
  }, [isDrivePickerOpen, drivePickerUser?.emailAddress]);

  const loadFolders = useCallback(async () => {
    if (!isDrivePickerOpen) return;
    const seq = ++reqSeqRef.current;
    setLoading(true);
    setError(null);
    try {
      const list = await GoogleDriveClient.listFolders({
        parentId: currentParent.id,
        sharedWithMe: sharedTab && breadcrumbs.length === 1,
        searchQuery: debouncedQuery || undefined
      });
      if (seq !== reqSeqRef.current) return;
      setFolders(list);
    } catch (err) {
      if (seq !== reqSeqRef.current) return;
      setError(
        err instanceof Error ? err.message : 'Failed to load folders from Google Drive.'
      );
    } finally {
      if (seq === reqSeqRef.current) {
        setLoading(false);
      }
    }
  }, [isDrivePickerOpen, currentParent.id, sharedTab, breadcrumbs.length, debouncedQuery]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  if (!isDrivePickerOpen) return null;

  const handleOpenSubfolder = (folder: DriveFolderItem) => {
    setSearchQuery('');
    setDebouncedQuery('');
    setSelectedFolder(folder);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    setBreadcrumbs((prev) => prev.slice(0, index + 1));
    const target = breadcrumbs[index];
    if (target.id === 'root') {
      setSelectedFolder(null);
    } else {
      setSelectedFolder({ id: target.id, name: target.name });
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await GoogleDriveClient.createFolder(
        newFolderName.trim(),
        currentParent.id
      );
      setShowCreateNew(false);
      setNewFolderName('');
      await loadFolders();
      setSelectedFolder(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create folder.');
    } finally {
      setCreating(false);
    }
  };

  const handleConfirmLink = async () => {
    if (selectedFolder) {
      await completeGoogleDriveFolderSelection(selectedFolder.id, selectedFolder.name);
    } else if (currentParent.id !== 'root') {
      await completeGoogleDriveFolderSelection(currentParent.id, currentParent.name);
    }
  };

  const activeTarget =
    selectedFolder ??
    (currentParent.id !== 'root'
      ? { id: currentParent.id, name: currentParent.name }
      : null);

  return (
    <div className="modal-backdrop" onClick={closeDrivePicker}>
      <div
        className="modal-panel"
        style={{ maxWidth: 640 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 14
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                backgroundColor: 'var(--primary-container)',
                color: 'var(--on-primary-container)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Cloud size={20} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
                Choose Google Drive Sync Folder
              </h3>
              <div style={{ fontSize: 12.5, color: 'var(--on-surface-variant)' }}>
                Select the same folder linked on your Android phone (containing{' '}
                <code>weekly-budget-master.csv</code>)
              </div>
            </div>
          </div>
          <button className="btn btn-ghost" onClick={closeDrivePicker} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* Connected Google Account Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: 12,
            backgroundColor: 'var(--surface-variant)',
            marginBottom: 14,
            gap: 10,
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <UserCheck size={16} style={{ color: 'var(--primary)' }} />
            <span>
              Signed in as{' '}
              <strong>
                {drivePickerUser?.emailAddress ||
                  drivePickerUser?.displayName ||
                  'Google Account'}
              </strong>
            </span>
          </div>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: '5px 10px', fontSize: 12 }}
            onClick={() => void startGoogleDriveLinkFlow()}
          >
            Switch Google Account
          </button>
        </div>

        {/* Tabs & Search */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            marginBottom: 12,
            flexWrap: 'wrap'
          }}
        >
          <button
            type="button"
            className={`chip ${!sharedTab ? 'active' : ''}`}
            onClick={() => {
              setSharedTab(false);
              setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
              setSelectedFolder(null);
            }}
          >
            My Drive
          </button>
          <button
            type="button"
            className={`chip ${sharedTab ? 'active' : ''}`}
            onClick={() => {
              setSharedTab(true);
              setBreadcrumbs([{ id: 'root', name: 'Shared with me' }]);
              setSelectedFolder(null);
            }}
          >
            Shared with me
          </button>

          <div style={{ flex: 1, position: 'relative', minWidth: 180 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--on-surface-variant)'
              }}
            />
            <input
              className="input"
              style={{ paddingLeft: 32, paddingRight: 10, paddingTop: 6, paddingBottom: 6 }}
              placeholder="Search folders by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-tonal"
            style={{ padding: '6px 11px', fontSize: 12.5 }}
            onClick={() => setShowCreateNew((v) => !v)}
          >
            <FolderPlus size={15} />
            New Folder
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '6px 9px' }}
            onClick={() => void loadFolders()}
            title="Refresh folders"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* New Folder Inline Creator */}
        {showCreateNew && (
          <form
            onSubmit={handleCreateFolder}
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: 12,
              borderRadius: 12,
              backgroundColor: 'var(--surface-container)',
              border: '1px solid var(--outline)',
              marginBottom: 12
            }}
          >
            <FolderPlus size={18} style={{ color: 'var(--primary)' }} />
            <input
              className="input"
              placeholder="New folder name (e.g. Weekly Budget)"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowCreateNew(false)}
            >
              Cancel
            </button>
          </form>
        )}

        {/* Breadcrumbs */}
        {!searchQuery.trim() && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              flexWrap: 'wrap',
              fontSize: 12.5,
              marginBottom: 10,
              color: 'var(--on-surface-variant)'
            }}
          >
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={`${crumb.id}-${idx}`}>
                {idx > 0 && <ChevronRight size={14} />}
                <button
                  type="button"
                  onClick={() => handleBreadcrumbClick(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '2px 6px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    color:
                      idx === breadcrumbs.length - 1
                        ? 'var(--primary)'
                        : 'var(--on-surface-variant)',
                    fontWeight: idx === breadcrumbs.length - 1 ? 700 : 500
                  }}
                >
                  {crumb.name}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {error && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              backgroundColor: 'rgba(239, 68, 68, 0.12)',
              color: 'var(--expense)',
              fontSize: 13,
              marginBottom: 12
            }}
          >
            {error}
          </div>
        )}

        {/* Folder List */}
        <div
          style={{
            border: '1px solid var(--outline-variant)',
            borderRadius: 12,
            minHeight: 240,
            maxHeight: 320,
            overflowY: 'auto',
            backgroundColor: 'var(--surface-container)'
          }}
        >
          {loading ? (
            <div
              style={{
                padding: 40,
                textAlign: 'center',
                color: 'var(--on-surface-variant)',
                fontSize: 13.5
              }}
            >
              Loading Google Drive folders...
            </div>
          ) : folders.length === 0 ? (
            <div
              style={{
                padding: 36,
                textAlign: 'center',
                color: 'var(--on-surface-variant)',
                fontSize: 13.5
              }}
            >
              No subfolders found here. You can select this folder or click{' '}
              <strong>New Folder</strong> above.
            </div>
          ) : (
            folders.map((folder) => {
              const isSelected = selectedFolder?.id === folder.id;
              return (
                <div
                  key={folder.id}
                  onClick={() => setSelectedFolder(folder)}
                  onDoubleClick={() => handleOpenSubfolder(folder)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderBottom: '1px solid var(--outline-variant)',
                    cursor: 'pointer',
                    backgroundColor: isSelected
                      ? 'var(--primary-container)'
                      : 'transparent',
                    color: isSelected
                      ? 'var(--on-primary-container)'
                      : 'var(--on-surface)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Folder
                      size={18}
                      style={{
                        color: isSelected
                          ? 'var(--on-primary-container)'
                          : 'var(--primary)'
                      }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{folder.name}</div>
                      {folder.modifiedTime && (
                        <div style={{ fontSize: 11.5, opacity: 0.75 }}>
                          Modified {new Date(folder.modifiedTime).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '4px 9px', fontSize: 12 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenSubfolder(folder);
                      }}
                    >
                      Open <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 16,
            gap: 12,
            flexWrap: 'wrap'
          }}
        >
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)' }}>
            {activeTarget ? (
              <>
                Selected folder: <strong>{activeTarget.name}</strong>
              </>
            ) : (
              'Click a folder to select it (or double-click to browse inside).'
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-outline" onClick={closeDrivePicker}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!activeTarget}
              onClick={() => void handleConfirmLink()}
            >
              <Check size={16} />
              Choose Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const GoogleClientIdSetupModal: React.FC = () => {
  const {
    isClientIdModalOpen,
    setIsClientIdModalOpen,
    startGoogleDriveLinkFlow
  } = useBudget();

  const [clientId, setClientId] = useState(() => GoogleDriveAuth.getClientId());

  if (!isClientIdModalOpen) return null;

  const currentOrigin =
    typeof window !== 'undefined' ? window.location.origin : 'https://<username>.github.io';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    GoogleDriveAuth.setCustomClientId(clientId);
    setIsClientIdModalOpen(false);
    if (clientId.trim()) {
      void startGoogleDriveLinkFlow();
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => setIsClientIdModalOpen(false)}>
      <div
        className="modal-panel"
        style={{ maxWidth: 580 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <KeyRound size={20} style={{ color: 'var(--primary)' }} />
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              Google Drive OAuth Client ID Setup
            </h3>
          </div>
          <button
            className="btn btn-ghost"
            onClick={() => setIsClientIdModalOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
          To open the Google Account Chooser and sync directly with your Google Drive from
          GitHub Pages, provide a Google Cloud <strong>Web Application OAuth Client ID</strong>{' '}
          (free in Google Cloud Console).
        </p>

        <div
          style={{
            padding: 14,
            borderRadius: 12,
            backgroundColor: 'var(--surface-variant)',
            fontSize: 12.5,
            lineHeight: 1.6,
            marginBottom: 14
          }}
        >
          <strong>Quick 3-Step Setup (Google Cloud Console):</strong>
          <ol style={{ margin: '6px 0 0 18px', padding: 0 }}>
            <li>
              Enable the <strong>Google Drive API</strong> in your Google Cloud project.
            </li>
            <li>
              Under <strong>APIs &amp; Services → Credentials → Create OAuth client ID</strong>,
              choose <strong>Web application</strong>.
            </li>
            <li>
              Add <code>{currentOrigin}</code> under{' '}
              <strong>Authorized JavaScript origins</strong>, then paste the Client ID below
              (or set <code>VITE_GOOGLE_CLIENT_ID</code> in your GitHub repository variables).
            </li>
          </ol>
        </div>

        <form onSubmit={handleSave}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
            Google OAuth Client ID
          </label>
          <input
            className="input"
            placeholder="1234567890-abcdefg.apps.googleusercontent.com"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            autoFocus
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
              marginTop: 16
            }}
          >
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setIsClientIdModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={!clientId.trim()}
            >
              Save &amp; Proceed to Google
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
