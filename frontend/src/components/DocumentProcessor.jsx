import { useState, useCallback, useRef } from "react";
import "../styles/DocumentProcessor.css";

/* ── Constants ─────────────────────────────────────────────────── */
const ACCEPTED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const MAX_IMAGE_MB = 20;
const MAX_PDF_MB = 50;
const API_URL = "/api/v1/process-document";

const TYPE_LABELS = {
  "image/jpeg": "JPEG",
  "image/png": "PNG",
  "image/webp": "WEBP",
  "application/pdf": "PDF",
};

/* ── Helpers ───────────────────────────────────────────────────── */
function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function clientValidate(file) {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return `Unsupported file type "${file.type}". Accepted: JPG, PNG, WEBP, PDF.`;
  }
  const limitMB = file.type === "application/pdf" ? MAX_PDF_MB : MAX_IMAGE_MB;
  if (file.size > limitMB * 1024 * 1024) {
    return `File too large (${humanSize(file.size)}). Max ${limitMB} MB for ${TYPE_LABELS[file.type] || file.type}.`;
  }
  return null;
}

/** Generate a unique ID for each file entry */
let _fileIdCounter = 0;
function nextFileId() {
  return `file-${++_fileIdCounter}`;
}

/* ── Component ─────────────────────────────────────────────────── */
export default function DocumentProcessor() {
  // Each entry: { id, file, preview, error }
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | uploading | done
  const [results, setResults] = useState([]); // array of { id, filename, result?, error? }
  const [globalError, setGlobalError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef(null);

  const validFiles = files.filter((f) => !f.error);

  /* ── Add files ────────────────────────────────────────────── */
  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;

    setGlobalError(null);

    const newEntries = incoming.map((file) => {
      const err = clientValidate(file);
      const entry = { id: nextFileId(), file, preview: null, error: err };

      // Generate preview for images
      if (!err && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === entry.id ? { ...f, preview: e.target.result } : f
            )
          );
        };
        reader.readAsDataURL(file);
      }
      return entry;
    });

    setFiles((prev) => [...prev, ...newEntries]);
  }, []);

  /* ── Remove a single file ─────────────────────────────────── */
  const removeFile = useCallback((id) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  /* ── Drag & drop handlers ──────────────────────────────────── */
  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  /* ── File input change ─────────────────────────────────────── */
  const onInputChange = useCallback(
    (e) => {
      if (e.target.files?.length) addFiles(e.target.files);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [addFiles]
  );

  /* ── Upload & process all files ────────────────────────────── */
  const processDocuments = useCallback(async () => {
    if (validFiles.length === 0) return;

    setStatus("uploading");
    setGlobalError(null);
    setResults([]);

    const allResults = await Promise.all(
      validFiles.map(async (entry) => {
        const formData = new FormData();
        formData.append("file", entry.file);

        try {
          const resp = await fetch(API_URL, {
            method: "POST",
            body: formData,
          });
          const data = await resp.json();

          if (!resp.ok) {
            return {
              id: entry.id,
              filename: entry.file.name,
              error: data.detail || `Server returned ${resp.status}`,
            };
          }
          return { id: entry.id, filename: entry.file.name, result: data };
        } catch (err) {
          return {
            id: entry.id,
            filename: entry.file.name,
            error: err.message || "Network error — is the backend running?",
          };
        }
      })
    );

    setResults(allResults);
    setStatus("done");
  }, [validFiles]);

  /* ── Reset ─────────────────────────────────────────────────── */
  const reset = useCallback(() => {
    setFiles([]);
    setResults([]);
    setGlobalError(null);
    setStatus("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  /* ── Render ────────────────────────────────────────────────── */
  const isProcessing = status === "uploading";
  const showResults = status === "done" && results.length > 0;
  const successResults = results.filter((r) => r.result);
  const errorResults = results.filter((r) => r.error);

  return (
    <div className="dp">
      {/* ── Global error banner ──────────────────────────────────── */}
      {globalError && (
        <div className="dp__error" role="alert">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" />
            <path d="M10 6v5M10 13.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <span>{globalError}</span>
          <button className="dp__error-close" onClick={() => setGlobalError(null)} aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {/* ── Drop zone ──────────────────────────────────────────── */}
      {!showResults && (
        <div
          className={`dp__dropzone ${dragActive ? "dp__dropzone--active" : ""} ${files.length > 0 ? "dp__dropzone--has-file" : ""}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          aria-label="Upload document area"
          id="dropzone"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            multiple
            className="dp__input"
            onChange={onInputChange}
            aria-hidden="true"
            id="file-input"
          />

          {files.length === 0 ? (
            <div className="dp__dropzone-content">
              <div className="dp__icon-wrap">
                <svg className="dp__upload-icon" width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <path
                    d="M24 32V16m0 0l-8 8m8-8l8 8"
                    stroke="url(#upload-grad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M40 30v6a4 4 0 01-4 4H12a4 4 0 01-4-4v-6"
                    stroke="url(#upload-grad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                  />
                  <defs>
                    <linearGradient id="upload-grad" x1="8" y1="16" x2="40" y2="40">
                      <stop stopColor="#8b5cf6" />
                      <stop offset="1" stopColor="#a855f7" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <p className="dp__dropzone-title">
                Drop your documents here, or <span className="dp__browse-link">browse</span>
              </p>
              <p className="dp__dropzone-hint">
                JPG, PNG, WEBP (max 20 MB) &nbsp;·&nbsp; PDF (max 50 MB, ≤ 100 pages) &nbsp;·&nbsp; Multiple files supported
              </p>
            </div>
          ) : (
            <div className="dp__file-list" onClick={(e) => e.stopPropagation()}>
              <div className="dp__file-list-header">
                <span className="dp__file-count">
                  {files.length} file{files.length !== 1 ? "s" : ""} selected
                  {files.length !== validFiles.length && (
                    <span className="dp__file-count-warn">
                      {" "}({files.length - validFiles.length} invalid)
                    </span>
                  )}
                </span>
                <button
                  className="dp__add-more-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  aria-label="Add more files"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  Add more
                </button>
              </div>

              <div className="dp__file-items">
                {files.map((entry) => (
                  <div
                    key={entry.id}
                    className={`dp__file-item ${entry.error ? "dp__file-item--error" : ""}`}
                  >
                    {/* Thumbnail */}
                    {entry.preview ? (
                      <img src={entry.preview} alt="" className="dp__file-item-thumb" />
                    ) : entry.file.type === "application/pdf" ? (
                      <div className="dp__file-item-icon dp__file-item-icon--pdf">
                        <svg width="20" height="24" viewBox="0 0 40 48" fill="none">
                          <defs>
                            <linearGradient id="pdf-grad" x1="1" y1="1" x2="39" y2="47">
                              <stop stopColor="#8b5cf6" />
                              <stop offset="1" stopColor="#a855f7" />
                            </linearGradient>
                          </defs>
                          <rect x="1" y="1" width="38" height="46" rx="4" stroke="url(#pdf-grad)" strokeWidth="2" />
                          <path d="M10 14h20M10 22h16M10 30h12" stroke="url(#pdf-grad)" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </div>
                    ) : (
                      <div className="dp__file-item-icon">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                          <rect x="2" y="2" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.5" />
                          <circle cx="7" cy="8" r="1.5" fill="currentColor" />
                          <path d="M2 14l4-4 3 3 3-3 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}

                    {/* Info */}
                    <div className="dp__file-item-info">
                      <p className="dp__file-item-name">{entry.file.name}</p>
                      <p className="dp__file-item-meta">
                        {entry.error ? (
                          <span className="dp__file-item-err-msg">{entry.error}</span>
                        ) : (
                          <>
                            {TYPE_LABELS[entry.file.type] || entry.file.type} &nbsp;·&nbsp; {humanSize(entry.file.size)}
                          </>
                        )}
                      </p>
                    </div>

                    {/* Remove button */}
                    <button
                      className="dp__file-item-remove"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(entry.id);
                      }}
                      aria-label={`Remove ${entry.file.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Action buttons ─────────────────────────────────────── */}
      {!showResults && (
        <div className="dp__actions">
          <button
            className="dp__btn dp__btn--primary"
            disabled={validFiles.length === 0 || isProcessing}
            onClick={processDocuments}
            id="process-btn"
          >
            {isProcessing ? (
              <>
                <span className="dp__spinner" aria-hidden="true" />
                Processing…
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9.5l4 4 8-8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Extract Text{validFiles.length > 1 ? ` (${validFiles.length} files)` : ""}
              </>
            )}
          </button>
          {files.length > 0 && !isProcessing && (
            <button className="dp__btn dp__btn--ghost" onClick={reset} id="reset-btn">
              Clear All
            </button>
          )}
        </div>
      )}

      {/* ── Processing overlay ─────────────────────────────────── */}
      {isProcessing && (
        <div className="dp__processing-overlay">
          <div className="dp__processing-card">
            <div className="dp__pulse-ring" />
            <p className="dp__processing-label">Analysing {validFiles.length} document{validFiles.length !== 1 ? "s" : ""}…</p>
            <p className="dp__processing-sub">Running OCR & text extraction pipeline</p>
          </div>
        </div>
      )}

      {/* ── Results viewer ──────────────────────────────────────── */}
      {showResults && (
        <div className="dp__results-container" id="result-panel">
          {/* Summary bar */}
          <div className="dp__results-summary">
            <div className="dp__results-summary-left">
              <h2 className="dp__result-title">Extraction Complete</h2>
              <p className="dp__results-summary-meta">
                <span className="dp__badge dp__badge--success">{successResults.length} succeeded</span>
                {errorResults.length > 0 && (
                  <span className="dp__badge dp__badge--error">{errorResults.length} failed</span>
                )}
              </p>
            </div>
            <div className="dp__result-actions">
              {successResults.length > 1 && (
                <button
                  className="dp__btn dp__btn--outline"
                  onClick={() => {
                    const allText = successResults
                      .map((r) => `──── ${r.result.filename} ────\n${r.result.extracted_text}`)
                      .join("\n\n");
                    navigator.clipboard.writeText(allText);
                  }}
                  id="copy-all-btn"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M11 5V3a2 2 0 00-2-2H3a2 2 0 00-2 2v6a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.5" />
                  </svg>
                  Copy All
                </button>
              )}
              <button className="dp__btn dp__btn--ghost" onClick={reset} id="new-upload-btn">
                New Upload
              </button>
            </div>
          </div>

          {/* Individual result cards */}
          {results.map((entry) => (
            <ResultCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── ResultCard sub-component ─────────────────────────────────── */
function ResultCard({ entry }) {
  const [expanded, setExpanded] = useState(false);

  if (entry.error) {
    return (
      <div className="dp__result dp__result--error">
        <div className="dp__result-header">
          <div>
            <p className="dp__filename">{entry.filename}</p>
            <p className="dp__result-error-msg">
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" />
                <path d="M10 6v5M10 13.5v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              {entry.error}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const r = entry.result;
  return (
    <div className="dp__result">
      <div className="dp__result-header">
        <div>
          <p className="dp__filename">{r.filename}</p>
          <p className="dp__result-meta">
            <span className="dp__badge dp__badge--success">{r.status}</span>
            <span>{r.mime_type}</span>
            <span className="dp__dot">·</span>
            <span>{humanSize(r.byte_size)}</span>
          </p>
        </div>
        <div className="dp__result-actions">
          <button
            className="dp__btn dp__btn--outline dp__btn--sm"
            onClick={() => navigator.clipboard.writeText(r.extracted_text)}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="5" y="5" width="9" height="9" rx="2" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 5V3a2 2 0 00-2-2H3a2 2 0 00-2 2v6a2 2 0 002 2h2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            Copy
          </button>
          <button
            className="dp__btn dp__btn--ghost dp__btn--sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Collapse" : "Expand"}
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              className={`dp__chevron ${expanded ? "dp__chevron--open" : ""}`}
            >
              <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div className="dp__result-stats">
        <div className="dp__stat">
          <span className="dp__stat-value">{r.extracted_text.length.toLocaleString()}</span>
          <span className="dp__stat-label">Characters</span>
        </div>
        <div className="dp__stat">
          <span className="dp__stat-value">
            {r.extracted_text.split(/\s+/).filter(Boolean).length.toLocaleString()}
          </span>
          <span className="dp__stat-label">Words</span>
        </div>
        <div className="dp__stat">
          <span className="dp__stat-value">
            {r.extracted_text.split("\n").length.toLocaleString()}
          </span>
          <span className="dp__stat-label">Lines</span>
        </div>
      </div>

      {expanded && (
        <textarea
          className="dp__textarea"
          readOnly
          value={r.extracted_text}
          rows={12}
          aria-label={`Extracted text from ${r.filename}`}
        />
      )}
    </div>
  );
}
