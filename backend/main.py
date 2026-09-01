"""
main.py
───────
FastAPI application — Module 1: Document Processing Pipeline.

Exposes:
  POST /api/v1/process-document   (multipart/form-data)

Returns a standardized JSON payload with extracted plain-text content.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from schemas import ProcessingResponse, ErrorResponse
from validators import (
    ALLOWED_IMAGE_TYPES,
    ALLOWED_PDF_TYPE,
    validate_mime_type,
    validate_file_size,
    validate_pdf_pages,
)
from preprocessor import preprocess_image
from ocr_engine import extract_text
from pdf_processor import process_pdf

# ── Logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(levelname)-8s │ %(name)s │ %(message)s",
)
logger = logging.getLogger("docpipeline")


# ── Lifespan (startup / shutdown) ──────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🚀 Document Processing Pipeline started")
    yield
    logger.info("🛑 Document Processing Pipeline shutting down")


# ── App factory ────────────────────────────────────────────────────
app = FastAPI(
    title="Document Processing Pipeline",
    description="Module 1 — Intelligent Document Management System",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS — allow React dev server ─────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check ───────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}


# ── Main endpoint ──────────────────────────────────────────────────
@app.post(
    "/api/v1/process-document",
    response_model=ProcessingResponse,
    responses={
        413: {"model": ErrorResponse, "description": "File too large"},
        415: {"model": ErrorResponse, "description": "Unsupported media type"},
        422: {"model": ErrorResponse, "description": "Unprocessable document"},
        500: {"model": ErrorResponse, "description": "Internal processing error"},
    },
)
async def process_document(file: UploadFile = File(...)):
    """
    Accept a document upload, validate it, extract text, and return a
    standardized JSON payload.
    """
    # ── 1. MIME validation ─────────────────────────────────────────
    mime_type = validate_mime_type(file)
    logger.info("Received '%s' (%s)", file.filename, mime_type)

    # ── 2. Read bytes ──────────────────────────────────────────────
    try:
        file_bytes = await file.read()
    except Exception as exc:
        logger.error("Failed to read upload: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to read uploaded file.")

    byte_size = len(file_bytes)

    # ── 3. Size validation ─────────────────────────────────────────
    validate_file_size(file_bytes, mime_type)

    # ── 4. Route to the right pipeline ─────────────────────────────
    try:
        if mime_type == ALLOWED_PDF_TYPE:
            # PDF-specific: page-count validation
            page_count = validate_pdf_pages(file_bytes)
            logger.info("PDF has %d page(s) — processing…", page_count)
            extracted_text = process_pdf(file_bytes)
        elif mime_type in ALLOWED_IMAGE_TYPES:
            logger.info("Image pipeline — preprocessing + OCR…")
            pil_image = preprocess_image(file_bytes)
            extracted_text = extract_text(pil_image)
        else:
            # Should never reach here (validate_mime_type would have raised)
            raise HTTPException(status_code=415, detail="Unsupported file type.")
    except HTTPException:
        raise  # re-raise validation errors as-is
    except Exception as exc:
        logger.exception("Processing engine error")
        raise HTTPException(
            status_code=500,
            detail=f"Document processing failed: {exc}",
        )

    logger.info(
        "✅ Extraction complete — %d characters from '%s'",
        len(extracted_text),
        file.filename,
    )

    return ProcessingResponse(
        status="success",
        filename=file.filename or "unknown",
        mime_type=mime_type,
        byte_size=byte_size,
        extracted_text=extracted_text,
    )
