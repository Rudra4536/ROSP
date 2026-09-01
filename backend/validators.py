"""
validators.py
─────────────
Strict validation rules for incoming document uploads.

• MIME-type whitelist
• Per-type file-size ceilings
• PDF page-count ceiling (via PyMuPDF)
"""

from __future__ import annotations

import pymupdf  # PyMuPDF
from fastapi import HTTPException, UploadFile

# ── Allowed MIME types ──────────────────────────────────────────────
ALLOWED_IMAGE_TYPES: set[str] = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_PDF_TYPE: str = "application/pdf"
ALLOWED_MIME_TYPES: set[str] = ALLOWED_IMAGE_TYPES | {ALLOWED_PDF_TYPE}

# ── Size limits (bytes) ────────────────────────────────────────────
MAX_IMAGE_SIZE: int = 20 * 1024 * 1024   # 20 MB
MAX_PDF_SIZE: int = 50 * 1024 * 1024     # 50 MB

# ── PDF page limit ─────────────────────────────────────────────────
MAX_PDF_PAGES: int = 100


def _human_size(size_bytes: int) -> str:
    """Return a human-readable file-size string."""
    if size_bytes < 1024:
        return f"{size_bytes} B"
    elif size_bytes < 1024 ** 2:
        return f"{size_bytes / 1024:.1f} KB"
    else:
        return f"{size_bytes / (1024 ** 2):.1f} MB"


def validate_mime_type(file: UploadFile) -> str:
    """
    Validate that the uploaded file's Content-Type is in the whitelist.

    Returns the validated MIME-type string.
    Raises HTTP 415 (Unsupported Media Type) on failure.
    """
    mime = (file.content_type or "").lower().strip()
    if mime not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=415,
            detail=(
                f"Unsupported file type '{mime}'. "
                f"Accepted types: {', '.join(sorted(ALLOWED_MIME_TYPES))}."
            ),
        )
    return mime


def validate_file_size(file_bytes: bytes, mime_type: str) -> None:
    """
    Enforce per-type file-size limits.

    Raises HTTP 413 (Payload Too Large) if the file exceeds the cap.
    """
    size = len(file_bytes)
    if mime_type == ALLOWED_PDF_TYPE:
        limit = MAX_PDF_SIZE
    else:
        limit = MAX_IMAGE_SIZE

    if size > limit:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File size {_human_size(size)} exceeds the "
                f"{_human_size(limit)} limit for '{mime_type}'."
            ),
        )


def validate_pdf_pages(file_bytes: bytes) -> int:
    """
    Open the PDF and check its page count.

    Returns the page count on success.
    Raises HTTP 422 (Unprocessable Entity) if the page count exceeds the limit.
    """
    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        raise HTTPException(
            status_code=422,
            detail=f"Could not open the PDF file: {exc}",
        )

    page_count = doc.page_count
    doc.close()

    if page_count > MAX_PDF_PAGES:
        raise HTTPException(
            status_code=422,
            detail=(
                f"PDF contains {page_count} pages, which exceeds the "
                f"maximum of {MAX_PDF_PAGES} pages."
            ),
        )
    return page_count
