'use client';

import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { formatDate, formatSize, type VaultFile } from './file-model';
import FilePreviewModal from './FilePreviewModal';

const ACCEPTED = {
  'application/pdf': ['.pdf'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/webp': ['.webp'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'text/plain': ['.txt'],
  'text/html': ['.html', '.htm'],
  'application/json': ['.json'],
};

interface Props {
  files: VaultFile[];
  loading: boolean;
  folderId: string | null;
  folderName?: string | null;
  openRequest: number;
  onUploaded: (file: VaultFile) => void;
  onDetails: (file: VaultFile) => void;
  onError: (message: string) => void;
  onStagingChange?: (active: boolean) => void;
}

interface OpenPreview {
  file: VaultFile;
  url: string | null;
}

async function responseError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    return payload?.error || fallback;
  } catch {
    return fallback;
  }
}

function extension(name: string) {
  return (name.split('.').pop() || 'file').toLowerCase();
}

function isImageType(type: string) {
  return ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(type.toLowerCase());
}

function isTextType(type: string) {
  return ['txt', 'csv', 'json', 'html', 'htm'].includes(type.toLowerCase());
}

function isImageFile(file: File) {
  return file.type.startsWith('image/') || isImageType(extension(file.name));
}

function isTextFile(file: File) {
  return file.type.startsWith('text/') || isTextType(extension(file.name));
}

function directImageUrl(file: VaultFile) {
  return isImageType(file.file_type) && file.storage_url ? file.storage_url : null;
}

export default function FileGallery({
  files,
  loading,
  folderId,
  folderName,
  openRequest,
  onUploaded,
  onDetails,
  onError,
  onStagingChange,
}: Props) {
  const [queued, setQueued] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [openPreview, setOpenPreview] = useState<OpenPreview | null>(null);
  const handledOpenRequest = useRef(openRequest);

  const stageFiles = useCallback((acceptedFiles: File[]) => {
    if (!acceptedFiles.length) return;
    setUploadErrors([]);
    setQueued(previous => {
      const existing = new Set(previous.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const additions = acceptedFiles.filter(file => !existing.has(`${file.name}-${file.size}-${file.lastModified}`));
      return [...previous, ...additions];
    });
  }, []);

  const handleRejected = useCallback((rejections: FileRejection[]) => {
    const messages = rejections.map(({ file, errors }) => `${file.name}: ${errors.map(error => error.message).join(', ')}`);
    setUploadErrors(messages);
    onError('One or more files use an unsupported format.');
  }, [onError]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDropAccepted: stageFiles,
    onDropRejected: handleRejected,
    accept: ACCEPTED,
    multiple: true,
    noClick: true,
    noKeyboard: true,
  });

  useEffect(() => {
    if (openRequest <= handledOpenRequest.current) return;
    handledOpenRequest.current = openRequest;
    open();
  }, [open, openRequest]);

  useEffect(() => {
    onStagingChange?.(queued.length > 0);
  }, [onStagingChange, queued.length]);

  const uploadQueued = useCallback(async () => {
    if (!queued.length || uploading) return;
    setUploading(true);
    setUploadErrors([]);

    const failed: File[] = [];
    const errors: string[] = [];
    let lastUploaded: VaultFile | null = null;

    for (const localFile of queued) {
      const formData = new FormData();
      formData.append('file', localFile);
      if (folderId) formData.append('folder_id', folderId);

      try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!response.ok) throw new Error(await responseError(response, 'Upload failed.'));
        const uploaded = await response.json() as VaultFile;
        lastUploaded = uploaded;
        onUploaded(uploaded);
      } catch (error) {
        failed.push(localFile);
        errors.push(`${localFile.name}: ${error instanceof Error ? error.message : 'Upload failed.'}`);
      }
    }

    setQueued(failed);
    setUploadErrors(errors);
    setUploading(false);

    if (errors.length) {
      onError(`${errors.length} ${errors.length === 1 ? 'file' : 'files'} could not be uploaded.`);
    } else if (lastUploaded) {
      setOpenPreview({ file: lastUploaded, url: directImageUrl(lastUploaded) });
    }
  }, [folderId, onError, onUploaded, queued, uploading]);

  const removeQueued = useCallback((index: number) => {
    if (uploading) return;
    setQueued(previous => previous.filter((_, itemIndex) => itemIndex !== index));
    setUploadErrors([]);
  }, [uploading]);

  return (
    <section {...getRootProps()} className={isDragActive ? 'vault-gallery-shell drag-active' : 'vault-gallery-shell'} aria-label="File gallery">
      <input {...getInputProps()} id="vault-gallery-file-input" />

      {isDragActive && (
        <div className="gallery-drop-overlay" aria-hidden="true">
          <strong>Release to stage files</strong>
          <span>They will appear in the gallery before anything uploads.</span>
        </div>
      )}

      {queued.length > 0 && (
        <section className="staged-gallery-section" aria-labelledby="staged-gallery-title">
          <header className="gallery-section-heading staging-heading">
            <div>
              <p>Ready to upload</p>
              <h2 id="staged-gallery-title">{queued.length} {queued.length === 1 ? 'file' : 'files'} staged for {folderName || 'All Files'}</h2>
            </div>
            <div className="staging-actions">
              <button type="button" className="gallery-secondary-action" onClick={() => setQueued([])} disabled={uploading}>Clear</button>
              <button type="button" className="gallery-upload-action" onClick={() => void uploadQueued()} disabled={uploading}>
                {uploading ? <><span className="spinner" /> Uploading…</> : `Upload ${queued.length}`}
              </button>
            </div>
          </header>

          <div className="file-preview-grid staged-preview-grid">
            {queued.map((file, index) => (
              <LocalPreviewTile
                key={`${file.name}-${file.size}-${file.lastModified}`}
                file={file}
                disabled={uploading}
                onRemove={() => removeQueued(index)}
              />
            ))}
          </div>

          {uploadErrors.length > 0 && (
            <div className="gallery-upload-errors" role="alert">
              <strong>Some files were not uploaded</strong>
              {uploadErrors.map((message, index) => <p key={`${message}-${index}`}>{message}</p>)}
            </div>
          )}
        </section>
      )}

      <section className="stored-gallery-section" aria-label="Stored files">
        {loading ? (
          <div className="file-preview-grid gallery-loading-grid" aria-label="Loading files">
            {Array.from({ length: 6 }).map((_, index) => <span key={index} className="gallery-skeleton" />)}
          </div>
        ) : files.length ? (
          <div className="file-preview-grid">
            {files.map(file => (
              <StoredPreviewTile
                key={file.id}
                file={file}
                onOpen={() => setOpenPreview({ file, url: directImageUrl(file) })}
                onDetails={() => onDetails(file)}
              />
            ))}
          </div>
        ) : queued.length === 0 ? (
          <div className="gallery-empty-state">
            <div className="gallery-empty-stack" aria-hidden="true"><span /><span /><span /></div>
            <h2>Your DocBox is empty</h2>
            <p>Drop files anywhere in this area or use Add Files above.</p>
          </div>
        ) : null}
      </section>

      {openPreview && (
        <FilePreviewModal
          file={openPreview.file}
          initialUrl={openPreview.url}
          onClose={() => setOpenPreview(null)}
        />
      )}
    </section>
  );
}

const StoredPreviewTile = memo(function StoredPreviewTile({ file, onOpen, onDetails }: {
  file: VaultFile;
  onOpen: () => void;
  onDetails: () => void;
}) {
  const type = file.file_type.toLowerCase();

  return (
    <article className="file-preview-tile">
      <div
        className="file-preview-open"
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onOpen();
          }
        }}
        aria-label={`Preview ${file.name}`}
      >
        <StoredPreviewContent file={file} type={type} />
        <span className="preview-open-label">Open preview</span>
      </div>
      <footer className="file-preview-caption">
        <div><strong title={file.name}>{file.name}</strong><span>{type.toUpperCase()} · {formatSize(file.size_bytes)} · {formatDate(file.upload_date)}</span></div>
        <button type="button" onClick={onDetails} aria-label={`Show details for ${file.name}`}>Details</button>
      </footer>
    </article>
  );
});

function StoredPreviewContent({ file, type }: { file: VaultFile; type: string }) {
  const extracted = (file.extracted_text || '').trim();

  if (isImageType(type) && file.storage_url) {
    return (
      <span className="gallery-preview-surface image-surface">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.storage_url} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }

  if (extracted) {
    return <span className="gallery-preview-surface text-surface"><span className="gallery-paper"><pre>{extracted}</pre></span></span>;
  }

  return (
    <span className={`gallery-preview-surface document-surface ${type === 'pdf' ? 'pdf-cover-surface' : ''}`}>
      <span className="gallery-document-sheet">
        <b>{type.toUpperCase() || 'FILE'}</b>
        <i /><i /><i />
        <small>{file.original_name}</small>
      </span>
    </span>
  );
}

function LocalPreviewTile({ file, disabled, onRemove }: { file: File; disabled: boolean; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [text, setText] = useState('');
  const type = extension(file.name);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;

    if (isImageFile(file)) {
      objectUrl = URL.createObjectURL(file);
      setUrl(objectUrl);
    } else if (isTextFile(file)) {
      file.text().then(value => { if (active) setText(value); }).catch(() => undefined);
    }

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return (
    <article className="file-preview-tile staged-tile">
      <div className="file-preview-open staged-preview-content">
        {isImageFile(file) && url ? (
          <span className="gallery-preview-surface image-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" decoding="async" />
          </span>
        ) : isTextFile(file) && text ? (
          <span className="gallery-preview-surface text-surface"><span className="gallery-paper"><pre>{text}</pre></span></span>
        ) : (
          <span className={`gallery-preview-surface document-surface ${type === 'pdf' ? 'pdf-cover-surface' : ''}`}>
            <span className="gallery-document-sheet"><b>{type.toUpperCase()}</b><i /><i /><i /><small>{file.name}</small></span>
          </span>
        )}
        <span className="staged-badge">Staged</span>
      </div>
      <footer className="file-preview-caption">
        <div><strong title={file.name}>{file.name}</strong><span>{type.toUpperCase()} · {formatSize(file.size)}</span></div>
        <button type="button" onClick={onRemove} disabled={disabled} aria-label={`Remove ${file.name}`}>Remove</button>
      </footer>
    </article>
  );
}
