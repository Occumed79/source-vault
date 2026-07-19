'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SearchBar from './SearchBar';
import type { VaultFile } from './file-model';
import VaultInspector from './VaultInspector';
import FileGallery from './FileGallery';
import LuminousBackdrop from './LuminousBackdrop';
import { ArchiveIcon, CloseIcon, FilesIcon, FolderIcon, PlusIcon, UploadIcon } from './icons';

export interface Folder {
  id: string;
  name: string;
  parent_id: string | null;
  color: string;
  file_count: number;
}

type NavView = 'all' | 'archive';

type CachedFileView = {
  files: VaultFile[];
  cachedAt: number;
};

const fileViewCache = new Map<string, CachedFileView>();
const CACHE_FRESHNESS_MS = 60_000;

function fileViewKey(view: NavView, folderId: string | null) {
  return view === 'archive' ? 'archive' : `folder:${folderId || 'root'}`;
}

function fileViewUrl(view: NavView, folderId: string | null) {
  const archived = view === 'archive';
  let url = `/api/files?archived=${archived}`;
  if (!archived) url += folderId ? `&folder_id=${encodeURIComponent(folderId)}` : '&folder_id=null';
  return url;
}

async function readError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
}

async function fetchFileView(view: NavView, folderId: string | null, signal?: AbortSignal) {
  const response = await fetch(fileViewUrl(view, folderId), { cache: 'no-store', signal });
  if (!response.ok) throw new Error(await readError(response, 'Could not load files.'));
  const data = await response.json();
  return Array.isArray(data) ? data as VaultFile[] : [];
}

function updateCachedFileEverywhere(updated: VaultFile) {
  for (const [key, cached] of fileViewCache) {
    if (!cached.files.some(file => file.id === updated.id)) continue;
    fileViewCache.set(key, {
      ...cached,
      files: cached.files.map(file => file.id === updated.id ? updated : file),
    });
  }
}

function removeCachedFileEverywhere(id: string) {
  for (const [key, cached] of fileViewCache) {
    fileViewCache.set(key, {
      ...cached,
      files: cached.files.filter(file => file.id !== id),
    });
  }
}

export default function VaultApp() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [navView, setNavView] = useState<NavView>('all');
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<VaultFile[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedFile, setSelectedFile] = useState<VaultFile | null>(null);
  const [stagingActive, setStagingActive] = useState(false);
  const [uploadOpenRequest, setUploadOpenRequest] = useState(0);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderMutation, setFolderMutation] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoAvailable, setLogoAvailable] = useState(true);
  const activeFileRequest = useRef<AbortController | null>(null);

  const reportError = useCallback((message: string) => setError(message), []);

  const prefetchView = useCallback(async (view: NavView, folderId: string | null) => {
    const key = fileViewKey(view, folderId);
    const cached = fileViewCache.get(key);
    if (cached && Date.now() - cached.cachedAt < CACHE_FRESHNESS_MS) return;

    try {
      const prefetched = await fetchFileView(view, folderId);
      fileViewCache.set(key, { files: prefetched, cachedAt: Date.now() });
    } catch {
      // Prefetch failures remain silent; the selected view will show the real error.
    }
  }, []);

  const loadFolders = useCallback(async () => {
    try {
      const response = await fetch('/api/folders', { cache: 'no-store' });
      if (!response.ok) throw new Error(await readError(response, 'Could not load folders.'));
      const data = await response.json();
      setFolders(Array.isArray(data) ? data : []);
      void prefetchView('archive', null);
    } catch (loadError) {
      reportError(loadError instanceof Error ? loadError.message : 'Could not load folders.');
    }
  }, [prefetchView, reportError]);

  const loadFiles = useCallback(async (force = false) => {
    const key = fileViewKey(navView, activeFolder);
    const cached = fileViewCache.get(key);
    const hasCachedFiles = Boolean(cached);

    if (cached) {
      setFiles(cached.files);
      setLoading(false);
    } else {
      setLoading(true);
    }

    if (!force && cached && Date.now() - cached.cachedAt < CACHE_FRESHNESS_MS) return;

    setError(null);
    activeFileRequest.current?.abort();
    const controller = new AbortController();
    activeFileRequest.current = controller;

    try {
      const loaded = await fetchFileView(navView, activeFolder, controller.signal);
      if (controller.signal.aborted) return;
      fileViewCache.set(key, { files: loaded, cachedAt: Date.now() });
      setFiles(loaded);
    } catch (loadError) {
      if (controller.signal.aborted) return;
      if (!hasCachedFiles) setFiles([]);
      reportError(loadError instanceof Error ? loadError.message : 'Could not load files.');
    } finally {
      if (activeFileRequest.current === controller) {
        activeFileRequest.current = null;
        setLoading(false);
      }
    }
  }, [activeFolder, navView, reportError]);

  useEffect(() => { void loadFolders(); }, [loadFolders]);
  useEffect(() => { if (!isSearching) void loadFiles(); }, [isSearching, loadFiles]);
  useEffect(() => () => activeFileRequest.current?.abort(), []);

  const displayFiles = isSearching ? searchResults : files;

  const navigateTo = useCallback((view: NavView, folderId: string | null = null) => {
    const nextFolder = view === 'archive' ? null : folderId;
    const cached = fileViewCache.get(fileViewKey(view, nextFolder));

    setNavView(view);
    setActiveFolder(nextFolder);
    setFiles(cached?.files || []);
    setLoading(!cached);
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedFile(null);
    setError(null);
  }, []);

  const handleSearchResults = useCallback((results: VaultFile[], query: string) => {
    setSearchResults(results);
    setSearchQuery(query);
    setIsSearching(true);
    setSelectedFile(null);
    setError(null);
  }, []);

  const handleSearchClear = useCallback(() => {
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectedFile(null);
  }, []);

  const createFolder = useCallback(async () => {
    const name = newFolderName.trim();
    if (!name || folderMutation) return;
    setFolderMutation(true);
    setError(null);
    try {
      const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not create the folder.'));
      setNewFolderName('');
      setShowNewFolder(false);
      await loadFolders();
    } catch (mutationError) {
      reportError(mutationError instanceof Error ? mutationError.message : 'Could not create the folder.');
    } finally {
      setFolderMutation(false);
    }
  }, [folderMutation, loadFolders, newFolderName, reportError]);

  const deleteFolder = useCallback(async (folder: Folder) => {
    if (folderMutation || !window.confirm(`Delete “${folder.name}”? Files in this folder will move to All Files.`)) return;
    setFolderMutation(true);
    setError(null);
    try {
      const response = await fetch('/api/folders', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: folder.id }),
      });
      if (!response.ok) throw new Error(await readError(response, 'Could not delete the folder.'));
      fileViewCache.delete(fileViewKey('all', folder.id));
      fileViewCache.delete(fileViewKey('all', null));
      if (activeFolder === folder.id) navigateTo('all');
      await Promise.all([loadFolders(), loadFiles(true)]);
    } catch (mutationError) {
      reportError(mutationError instanceof Error ? mutationError.message : 'Could not delete the folder.');
    } finally {
      setFolderMutation(false);
    }
  }, [activeFolder, folderMutation, loadFiles, loadFolders, navigateTo, reportError]);

  const openUpload = useCallback(() => {
    if (navView === 'archive') navigateTo('all');
    setUploadOpenRequest(request => request + 1);
  }, [navView, navigateTo]);

  const handleUploaded = useCallback((uploaded: VaultFile) => {
    setNavView('all');
    setIsSearching(false);
    setSearchQuery('');
    setSearchResults([]);

    const destinationFolder = uploaded.folder_id || null;
    const destinationKey = fileViewKey('all', destinationFolder);
    const destinationCache = fileViewCache.get(destinationKey);
    const nextDestination = [uploaded, ...(destinationCache?.files || []).filter(file => file.id !== uploaded.id)];
    fileViewCache.set(destinationKey, { files: nextDestination, cachedAt: Date.now() });

    if (destinationFolder === activeFolder) setFiles(nextDestination);
    setSelectedFile(null);
    void loadFolders();
  }, [activeFolder, loadFolders]);

  const handleUpdate = useCallback((updated: VaultFile) => {
    updateCachedFileEverywhere(updated);
    setFiles(previous => previous.map(file => file.id === updated.id ? updated : file));
    setSearchResults(previous => previous.map(file => file.id === updated.id ? updated : file));
    setSelectedFile(previous => previous?.id === updated.id ? updated : previous);
  }, []);

  const handleRemove = useCallback((id: string) => {
    removeCachedFileEverywhere(id);
    setFiles(previous => previous.filter(file => file.id !== id));
    setSearchResults(previous => previous.filter(file => file.id !== id));
    setSelectedFile(previous => previous?.id === id ? null : previous);
    void loadFolders();
  }, [loadFolders]);

  const rootFolders = useMemo(() => folders.filter(folder => !folder.parent_id), [folders]);
  const activeFolderName = activeFolder ? folders.find(folder => folder.id === activeFolder)?.name : null;
  const viewTitle = isSearching ? `Results for “${searchQuery}”` : activeFolderName || (navView === 'archive' ? 'Archive' : 'All Files');

  return (
    <div className="cosmic-vault-shell abyssal-vault-shell docbox-vault-shell">
      <LuminousBackdrop />

      <div className="cosmic-vault-ui">
        <header className="cosmic-command-stack">
          <div className="cosmic-command-bar">
            <Link href="/" className="cosmic-brand docbox-brand" aria-label="Return to DocBox landing page">
              {logoAvailable && (
                <span className="docbox-header-logo" aria-hidden="true">
                  <img src="/occu-med-logo.png" alt="" onError={() => setLogoAvailable(false)} />
                </span>
              )}
              <span><strong>DocBox</strong><small>Occu-Med document workspace</small></span>
            </Link>
            <div className="cosmic-search"><SearchBar onResults={handleSearchResults} onClear={handleSearchClear} onError={reportError} /></div>
            <button type="button" className="cosmic-upload-button" onClick={openUpload}><UploadIcon /><span>Add Files</span></button>
          </div>

          <div className="cosmic-folder-dock" aria-label="DocBox locations">
            <div className="cosmic-folder-scroll">
              <button
                type="button"
                className={navView === 'all' && !isSearching && !activeFolder ? 'cosmic-location-pill active' : 'cosmic-location-pill'}
                onClick={() => navigateTo('all')}
                onPointerEnter={() => void prefetchView('all', null)}
              ><FilesIcon /><span>All Files</span><small>{navView === 'all' && !activeFolder ? displayFiles.length : ''}</small></button>
              <button
                type="button"
                className={navView === 'archive' && !isSearching ? 'cosmic-location-pill active' : 'cosmic-location-pill'}
                onClick={() => navigateTo('archive')}
                onPointerEnter={() => void prefetchView('archive', null)}
              ><ArchiveIcon /><span>Archive</span></button>

              {rootFolders.map(folder => (
                <div key={folder.id} className={activeFolder === folder.id && !isSearching ? 'cosmic-folder-pill active' : 'cosmic-folder-pill'}>
                  <button
                    type="button"
                    onClick={() => navigateTo('all', folder.id)}
                    onPointerEnter={() => void prefetchView('all', folder.id)}
                  ><FolderIcon color="currentColor" /><span>{folder.name}</span><small>{folder.file_count}</small></button>
                  <button type="button" className="cosmic-folder-delete" onClick={() => void deleteFolder(folder)} aria-label={`Delete ${folder.name}`}><CloseIcon /></button>
                </div>
              ))}
            </div>

            <div className="cosmic-folder-create">
              {showNewFolder ? (
                <div className="cosmic-folder-form">
                  <input autoFocus value={newFolderName} onChange={event => setNewFolderName(event.target.value)} onKeyDown={event => {
                    if (event.key === 'Enter') void createFolder();
                    if (event.key === 'Escape') { setShowNewFolder(false); setNewFolderName(''); }
                  }} placeholder="Folder name" disabled={folderMutation} />
                  <button type="button" onClick={() => void createFolder()} disabled={folderMutation || !newFolderName.trim()}>Create</button>
                  <button type="button" onClick={() => { setShowNewFolder(false); setNewFolderName(''); }} aria-label="Cancel"><CloseIcon /></button>
                </div>
              ) : (
                <button type="button" className="cosmic-new-folder-button" onClick={() => setShowNewFolder(true)}><PlusIcon /><span>New Folder</span></button>
              )}
            </div>
          </div>
        </header>

        {error && <div className="cosmic-status-banner" role="alert"><span>{error}</span><button type="button" onClick={() => setError(null)} aria-label="Dismiss error"><CloseIcon /></button></div>}

        <main className={selectedFile && !stagingActive ? 'gallery-workspace has-inspector' : 'gallery-workspace'}>
          <section className="gallery-main-column" aria-labelledby="current-view-title">
            <div className="view-heading"><div><p>Current View</p><h1 id="current-view-title">{viewTitle}</h1></div><span>{displayFiles.length} {displayFiles.length === 1 ? 'file' : 'files'}</span></div>
            <FileGallery
              files={displayFiles}
              loading={loading}
              folderId={activeFolder}
              folderName={activeFolderName}
              openRequest={uploadOpenRequest}
              onUploaded={handleUploaded}
              onDetails={setSelectedFile}
              onError={reportError}
              onStagingChange={setStagingActive}
            />
          </section>

          {selectedFile && !stagingActive && <VaultInspector file={selectedFile} onClose={() => setSelectedFile(null)} onUpdate={handleUpdate} onRemove={handleRemove} onError={reportError} />}
        </main>
      </div>
    </div>
  );
}
