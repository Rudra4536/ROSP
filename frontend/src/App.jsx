import { useState, useCallback, useRef } from "react";

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

let _fileIdCounter = 0;
function nextFileId() {
  return `file-${++_fileIdCounter}`;
}

/* ── Pipeline Steps ────────────────────────────────────────────── */
const STEPS = [
  { label: "1. Validation", icon: "check" },
  { label: "2. Image Preprocessing", icon: "check" },
  { label: "3. OCR Execution", icon: "sync" },
  { label: "4. Sanitized Payload", icon: null },
];

function getStepState(stepIdx, status) {
  // idle: all steps incomplete
  // uploading: steps 1-2 complete, step 3 in-progress, step 4 pending
  // done: all steps complete
  if (status === "done") return "complete";
  if (status === "uploading") {
    if (stepIdx < 2) return "complete";
    if (stepIdx === 2) return "active";
    return "pending";
  }
  return "pending";
}

/* ── App Component ─────────────────────────────────────────────── */
function App() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [files, setFiles] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | uploading | done
  const [results, setResults] = useState([]);
  const [globalError, setGlobalError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [resultTab, setResultTab] = useState("json"); // json | text
  const [processingTime, setProcessingTime] = useState(null);
  const inputRef = useRef(null);

  const validFiles = files.filter((f) => !f.error);

  /* ── Add files ────────────────────────────────────────────── */
  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList);
    if (incoming.length === 0) return;
    setGlobalError(null);

    const newEntries = incoming.map((file) => {
      const err = clientValidate(file);
      return { id: nextFileId(), file, error: err };
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

  const onInputChange = useCallback(
    (e) => {
      if (e.target.files?.length) addFiles(e.target.files);
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
    setProcessingTime(null);

    const startTime = performance.now();

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

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
    setProcessingTime(elapsed);
    setResults(allResults);
    setStatus("done");
  }, [validFiles]);

  /* ── Reset ─────────────────────────────────────────────────── */
  const reset = useCallback(() => {
    setFiles([]);
    setResults([]);
    setGlobalError(null);
    setStatus("idle");
    setProcessingTime(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  /* ── Render helpers ─────────────────────────────────────────── */
  const showResults = status === "done" && results.length > 0;
  const successResults = results.filter((r) => r.result);
  const errorResults = results.filter((r) => r.error);

  /* Build JSON display from first successful result */
  const firstSuccess = successResults[0]?.result || null;

  const progressPercent =
    status === "done" ? 100 : status === "uploading" ? 75 : 0;

  return (
    <>
      {/* ═══ TopNavBar ═══ */}
      <nav className="bg-surface border-b border-outline-variant flex justify-between items-center w-full px-lg h-16 shrink-0 z-50 sticky top-0">
        <div className="flex items-center gap-gutter">
          <span className="text-headline-sm font-headline-sm font-bold text-primary tracking-tight">
            DocStream
          </span>
          <div className="hidden md:flex gap-sm">
            <button
              className={`flex items-center px-sm py-1 transition-colors cursor-pointer active:opacity-80 ${
                activeTab === "dashboard"
                  ? "text-primary border-b-2 border-primary"
                  : "text-on-surface-variant hover:text-primary"
              }`}
              onClick={() => setActiveTab("dashboard")}
            >
              Dashboard
            </button>
            <button
              className={`flex items-center px-sm py-1 transition-colors cursor-pointer active:opacity-80 ${
                activeTab === "pipelines"
                  ? "text-primary border-b-2 border-primary"
                  : "text-on-surface-variant hover:text-primary"
              }`}
              onClick={() => setActiveTab("pipelines")}
            >
              Pipelines
            </button>
            <button className="text-on-surface-variant hover:text-primary transition-colors flex items-center px-sm cursor-pointer active:opacity-80">
              Logs
            </button>
            <button className="text-on-surface-variant hover:text-primary transition-colors flex items-center px-sm cursor-pointer active:opacity-80">
              Settings
            </button>
          </div>
        </div>
        <div className="flex items-center gap-md">
          <span
            className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
            data-icon="notifications"
          >
            notifications
          </span>
          <span
            className="material-symbols-outlined text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
            data-icon="help_outline"
          >
            help_outline
          </span>
          <div className="w-8 h-8 rounded-full bg-surface-container-high border border-outline-variant overflow-hidden flex items-center justify-center cursor-pointer">
            <span
              className="material-symbols-outlined text-outline"
              data-icon="person"
            >
              person
            </span>
          </div>
        </div>
      </nav>

      {/* ═══ Main Content ═══ */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto p-gutter flex flex-col gap-lg">
        {/* ── Header & Breadcrumbs ── */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-md">
          <div>
            <div className="flex items-center gap-sm mb-xs">
              <span className="font-label-caps text-label-caps text-outline uppercase tracking-wider">
                DocuProcess
              </span>
              <span className="material-symbols-outlined text-[16px] text-outline-variant">
                chevron_right
              </span>
              <span className="font-label-caps text-label-caps text-primary uppercase tracking-wider bg-primary/10 px-2 py-1 rounded">
                Module 1: Ingestion &amp; OCR Preprocessing
              </span>
            </div>
            <h1 className="font-headline-md text-headline-md text-on-background">
              Pipeline Stage 1
            </h1>
          </div>
          <div className="flex items-center bg-surface-container-low border border-outline-variant px-sm py-2 rounded-full shadow-sm hover:shadow-md transition-shadow">
            <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
            <span className="font-body-sm text-body-sm text-on-surface-variant font-medium">
              Engine Status: Active (FastAPI + Tesseract)
            </span>
          </div>
        </header>

        {/* ── Global Error ── */}
        {globalError && (
          <div className="bg-error-container/30 border border-error/20 rounded-xl p-md flex items-center gap-sm animate-fade-in-up">
            <span className="material-symbols-outlined text-error text-[20px]">
              error
            </span>
            <span className="font-body-sm text-body-sm text-error flex-1">
              {globalError}
            </span>
            <button
              onClick={() => setGlobalError(null)}
              className="w-8 h-8 rounded hover:bg-error/10 flex items-center justify-center text-error transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[18px]">
                close
              </span>
            </button>
          </div>
        )}

        {/* ── Pipeline Progress ── */}
        <section className="bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm">
          <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase mb-md border-b border-outline-variant pb-xs">
            Pipeline Status &amp; Telemetry Tracker
          </h2>
          <div className="flex items-center justify-between w-full relative">
            {/* Progress line background */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-0.5 bg-outline-variant/30 -z-10" />
            {/* Progress line fill */}
            <div
              className="absolute left-0 top-1/2 -translate-y-1/2 h-0.5 bg-primary -z-10 transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
            {STEPS.map((step, idx) => {
              const state = getStepState(idx, status);
              return (
                <div
                  key={idx}
                  className="flex flex-col items-center gap-xs"
                >
                  {state === "complete" ? (
                    <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm shadow-sm ring-4 ring-surface-container-lowest">
                      <span className="material-symbols-outlined text-[18px]">
                        check
                      </span>
                    </div>
                  ) : state === "active" ? (
                    <div className="w-8 h-8 rounded-full bg-surface-container-lowest border-2 border-primary text-primary flex items-center justify-center font-bold text-sm shadow-sm ring-4 ring-surface-container-lowest">
                      <span className="material-symbols-outlined text-[18px] animate-spin">
                        sync
                      </span>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-surface-container-lowest border border-outline-variant text-outline flex items-center justify-center font-bold text-sm shadow-sm ring-4 ring-surface-container-lowest">
                      {idx + 1}
                    </div>
                  )}
                  <span
                    className={`font-body-sm text-body-sm ${
                      state === "active"
                        ? "text-primary font-bold"
                        : state === "complete"
                        ? "text-on-background font-medium"
                        : "text-outline-variant"
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex justify-end">
            <span className="font-code-sm text-code-sm text-on-surface-variant bg-surface-container px-2 py-1 rounded">
              Execution time:{" "}
              <span className="text-primary">
                {processingTime
                  ? `Processed in ${processingTime}s`
                  : status === "uploading"
                  ? "Processing…"
                  : "Awaiting input"}
              </span>
            </span>
          </div>
        </section>

        {/* ── Bento Grid Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter items-start">
          {/* ── Left Panel: Upload Zone ── */}
          <section className="lg:col-span-5 bg-surface-container-lowest border border-outline-variant rounded-xl p-md shadow-sm flex flex-col gap-md">
            <h2 className="font-label-caps text-label-caps text-on-surface-variant uppercase border-b border-outline-variant pb-xs">
              Upload &amp; Ingestion Zone
            </h2>

            {/* Drop Zone */}
            <div
              className={`relative border-2 border-dashed rounded-xl p-lg flex flex-col items-center justify-center text-center gap-sm bg-surface-container-low/50 hover:bg-surface-container hover:border-primary transition-all cursor-pointer group min-h-[240px] ${
                dragActive
                  ? "border-primary bg-surface-container scale-[1.01]"
                  : "border-outline-variant"
              }`}
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
                className="hidden"
                onChange={onInputChange}
                aria-hidden="true"
                id="file-input"
              />
              <div className="absolute inset-0 dropzone-pattern rounded-xl pointer-events-none" />
              <div className="w-12 h-12 rounded-full bg-surface-container-highest flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm relative z-10">
                <span
                  className="material-symbols-outlined text-primary text-[28px]"
                  data-icon="cloud_upload"
                >
                  cloud_upload
                </span>
              </div>
              <div className="relative z-10">
                <p className="font-body-md text-body-md text-on-background font-medium">
                  Drag &amp; Drop documents here
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  or click to browse local files
                </p>
              </div>
              <div className="flex gap-xs mt-sm relative z-10">
                {[".pdf", ".jpg", ".png", ".webp"].map((ext) => (
                  <span
                    key={ext}
                    className="font-code-sm text-code-sm bg-surface border border-outline-variant px-2 py-1 rounded text-outline"
                  >
                    {ext}
                  </span>
                ))}
              </div>
              <div className="flex gap-sm mt-xs relative z-10">
                <span className="font-label-caps text-label-caps text-on-surface-variant opacity-80">
                  Max Image: 20MB
                </span>
                <span className="font-label-caps text-label-caps text-on-surface-variant opacity-80">
                  Max PDF: 50MB
                </span>
              </div>
            </div>

            {/* Selected File Cards */}
            {files.map((entry) => (
              <div
                key={entry.id}
                className={`bg-surface border rounded-lg p-sm flex items-center justify-between shadow-sm group transition-colors animate-fade-in-up ${
                  entry.error
                    ? "border-error/30 bg-error-container/10"
                    : "border-outline-variant hover:border-primary"
                }`}
              >
                <div className="flex items-center gap-sm">
                  <div
                    className={`w-10 h-10 rounded flex items-center justify-center shrink-0 ${
                      entry.error
                        ? "bg-error/10 text-error"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    <span className="material-symbols-outlined">
                      {entry.error ? "error" : "description"}
                    </span>
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="font-body-sm text-body-sm text-on-background font-medium truncate w-48">
                      {entry.file.name}
                    </span>
                    <div className="flex gap-xs items-center">
                      {entry.error ? (
                        <span className="font-code-sm text-code-sm text-error truncate max-w-[200px]">
                          {entry.error}
                        </span>
                      ) : (
                        <>
                          <span className="font-code-sm text-code-sm text-outline-variant">
                            {TYPE_LABELS[entry.file.type] || entry.file.type}
                          </span>
                          <span className="text-outline-variant text-[10px]">
                            •
                          </span>
                          <span className="font-code-sm text-code-sm text-outline-variant">
                            {humanSize(entry.file.size)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => removeFile(entry.id)}
                  className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center text-outline hover:text-error transition-colors shrink-0"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    close
                  </span>
                </button>
              </div>
            ))}

            {/* Process Button */}
            <button
              className={`w-full font-body-md text-body-md py-sm rounded-lg shadow-sm transition-all flex items-center justify-center gap-xs ${
                validFiles.length === 0 || status === "uploading"
                  ? "bg-outline-variant text-outline cursor-not-allowed opacity-60"
                  : "bg-primary hover:bg-primary-container text-on-primary"
              }`}
              disabled={validFiles.length === 0 || status === "uploading"}
              onClick={processDocuments}
              id="process-btn"
            >
              {status === "uploading" ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">
                    sync
                  </span>
                  Processing…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">
                    play_arrow
                  </span>
                  Process Document
                  {validFiles.length > 1
                    ? `s (${validFiles.length})`
                    : ""}
                </>
              )}
            </button>

            {/* Reset button */}
            {files.length > 0 && status !== "uploading" && (
              <button
                className="w-full font-body-sm text-body-sm py-2 rounded-lg border border-outline-variant text-on-surface-variant hover:bg-surface-container transition-colors flex items-center justify-center gap-xs"
                onClick={reset}
                id="reset-btn"
              >
                <span className="material-symbols-outlined text-[16px]">
                  restart_alt
                </span>
                Clear All
              </button>
            )}
          </section>

          {/* ── Right Panel: Output Viewer ── */}
          <section className="lg:col-span-7 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-sm flex flex-col overflow-hidden h-full min-h-[500px]">
            {/* Tab Header */}
            <div className="flex items-center justify-between border-b border-outline-variant bg-surface px-md py-xs">
              <div className="flex gap-sm">
                <button
                  className={`font-label-caps text-label-caps px-md py-sm focus:outline-none transition-colors ${
                    resultTab === "json"
                      ? "text-primary border-b-2 border-primary"
                      : "text-on-surface-variant hover:text-on-background"
                  }`}
                  onClick={() => setResultTab("json")}
                >
                  JSON Payload
                </button>
                <button
                  className={`font-label-caps text-label-caps px-md py-sm focus:outline-none transition-colors ${
                    resultTab === "text"
                      ? "text-primary border-b-2 border-primary"
                      : "text-on-surface-variant hover:text-on-background"
                  }`}
                  onClick={() => setResultTab("text")}
                >
                  Formatted Text
                </button>
              </div>
              <div className="flex gap-xs">
                <button
                  className="p-xs rounded hover:bg-surface-container text-outline hover:text-on-background transition-colors flex items-center"
                  title="Copy"
                  onClick={() => {
                    if (firstSuccess) {
                      if (resultTab === "json") {
                        navigator.clipboard.writeText(
                          JSON.stringify(firstSuccess, null, 2)
                        );
                      } else {
                        const allText = successResults
                          .map(
                            (r) =>
                              `──── ${r.result.filename} ────\n${r.result.extracted_text}`
                          )
                          .join("\n\n");
                        navigator.clipboard.writeText(allText);
                      }
                    }
                  }}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    content_copy
                  </span>
                </button>
                <button
                  className="p-xs rounded hover:bg-surface-container text-outline hover:text-on-background transition-colors flex items-center"
                  title="Download"
                  onClick={() => {
                    if (firstSuccess) {
                      const blob = new Blob(
                        [
                          resultTab === "json"
                            ? JSON.stringify(firstSuccess, null, 2)
                            : firstSuccess.extracted_text,
                        ],
                        {
                          type:
                            resultTab === "json"
                              ? "application/json"
                              : "text/plain",
                        }
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `extraction_result.${
                        resultTab === "json" ? "json" : "txt"
                      }`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }
                  }}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    download
                  </span>
                </button>
              </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-[#1e1e24] p-md overflow-auto relative font-code-md text-code-md text-slate-300">
              {showResults && firstSuccess ? (
                resultTab === "json" ? (
                  <JsonViewer data={firstSuccess} />
                ) : (
                  <pre className="leading-relaxed whitespace-pre-wrap">
                    {successResults.map((r, i) => (
                      <div key={r.id}>
                        {successResults.length > 1 && (
                          <div className="text-primary mb-2 font-bold">
                            ──── {r.result.filename} ────
                          </div>
                        )}
                        <div className="mb-4">{r.result.extracted_text}</div>
                      </div>
                    ))}
                    {errorResults.map((r) => (
                      <div key={r.id} className="text-red-400 mb-4">
                        ✗ {r.filename}: {r.error}
                      </div>
                    ))}
                  </pre>
                )
              ) : status === "uploading" ? (
                <div className="flex flex-col items-center justify-center h-full gap-md text-center">
                  <span className="material-symbols-outlined text-[48px] text-primary animate-spin">
                    sync
                  </span>
                  <p className="text-body-md font-body-md text-slate-400">
                    Processing documents through OCR pipeline…
                  </p>
                </div>
              ) : (
                <pre className="leading-relaxed text-slate-500 flex flex-col items-center justify-center h-full text-center">
                  <span className="material-symbols-outlined text-[48px] text-outline mb-4">
                    terminal
                  </span>
                  <span className="text-body-md font-body-md">
                    Output will appear here
                  </span>
                  <span className="text-body-sm font-body-sm mt-1 text-slate-600">
                    Upload a document and click Process to begin
                  </span>
                </pre>
              )}
            </div>

            {/* Results summary footer */}
            {showResults && (
              <div className="flex items-center justify-between border-t border-outline-variant bg-surface px-md py-xs">
                <div className="flex gap-sm items-center">
                  <span className="font-code-sm text-code-sm text-green-600 bg-green-50 px-2 py-1 rounded">
                    {successResults.length} succeeded
                  </span>
                  {errorResults.length > 0 && (
                    <span className="font-code-sm text-code-sm text-error bg-error-container/30 px-2 py-1 rounded">
                      {errorResults.length} failed
                    </span>
                  )}
                </div>
                <button
                  className="font-body-sm text-body-sm text-primary hover:text-primary-container transition-colors cursor-pointer flex items-center gap-xs"
                  onClick={reset}
                  id="new-upload-btn"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    add
                  </span>
                  New Upload
                </button>
              </div>
            )}
          </section>
        </div>
      </main>
    </>
  );
}

/* ── JSON Viewer Sub-component ─────────────────────────────────── */
function JsonViewer({ data }) {
  const jsonStr = JSON.stringify(data, null, 2);

  // Simple syntax highlighting
  const highlighted = jsonStr
    .replace(
      /("(?:\\.|[^"\\])*")\s*:/g,
      '<span class="json-key">$1</span>:'
    )
    .replace(
      /:\s*("(?:\\.|[^"\\])*")/g,
      ': <span class="json-string">$1</span>'
    )
    .replace(
      /:\s*(\d+\.?\d*)/g,
      ': <span class="json-number">$1</span>'
    )
    .replace(/([{}])/g, '<span class="json-brace">$1</span>')
    .replace(/([[|\]])/g, '<span class="json-bracket">$1</span>');

  return (
    <pre className="leading-relaxed">
      <code dangerouslySetInnerHTML={{ __html: highlighted }} />
    </pre>
  );
}

export default App;
