'use client';

import { useEffect, useRef, useState } from 'react';
import type { VaultFile } from './file-model';

const QUICK_SEARCHES = ['signed agreement', 'invoice package', 'training materials', 'employee forms'];

interface Props {
  onResults: (results: VaultFile[], query: string) => void;
  onClear: () => void;
  onError?: (message: string) => void;
}

export default function SearchBar({ onResults, onClear, onError }: Props) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setLoading(false);
      onClear();
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) {
          let message = 'Search could not be completed.';
          try {
            const payload = await response.json();
            message = payload?.error || message;
          } catch {
            // Keep the fallback message.
          }
          throw new Error(message);
        }
        const data = await response.json();
        onResults(Array.isArray(data) ? data : [], trimmed);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === 'AbortError') return;
        onError?.(searchError instanceof Error ? searchError.message : 'Search could not be completed.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 360);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [onClear, onError, onResults, query]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === 'Escape' && document.activeElement === inputRef.current) {
        setQuery('');
        inputRef.current?.blur();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  return (
    <div className="search-stack">
      <div className="search-control control-glass">
        <span className="search-icon" aria-hidden="true">
          {loading ? (
            <span className="spinner" />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-4-4" />
            </svg>
          )}
        </span>
        <label className="sr-only" htmlFor="vault-search">Search DocBox</label>
        <input
          id="vault-search"
          ref={inputRef}
          type="search"
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Search filenames, document text, tags, and notes"
          autoComplete="off"
          spellCheck="false"
        />
        {query ? (
          <button type="button" className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        ) : (
          <kbd className="keyboard-hint">⌘K</kbd>
        )}
      </div>

      {!query && (
        <div className="search-suggestions" aria-label="Suggested searches">
          <span>Try:</span>
          {QUICK_SEARCHES.map(value => (
            <button key={value} type="button" onClick={() => {
              setQuery(value);
              inputRef.current?.focus();
            }}>
              {value}
            </button>
          ))}
        </div>
      )}

      <span className="sr-only" aria-live="polite">{loading ? 'Searching DocBox' : ''}</span>
    </div>
  );
}
