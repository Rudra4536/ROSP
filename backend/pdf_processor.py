"""
pdf_processor.py
────────────────
Dual-path PDF text extraction engine.

For every page in the document:
  • **Digital path** — if selectable text length > NATIVE_TEXT_THRESHOLD,
    use the native text directly (fast, high fidelity).
  • **Scanned path** — otherwise, rasterise the page at RENDER_DPI,
    pass through the image preprocessor, and run Tesseract OCR.

All page texts are joined with double newlines and returned as a
consolidated string.
"""

from __future__ import annotations

import pymupdf

from preprocessor import preprocess_image
from ocr_engine import extract_text

# ── Tunable constants ──────────────────────────────────────────────
NATIVE_TEXT_THRESHOLD: int = 50   # characters — below this → OCR fallback
RENDER_DPI: int = 200             # pixmap rasterisation resolution


def process_pdf(file_bytes: bytes) -> str:
    """
    Extract text from every page of a PDF.

    Parameters
    ----------
    file_bytes : bytes
        Raw PDF file content.

    Returns
    -------
    str
        Consolidated plain-text extracted from the entire document.

    Raises
    ------
    RuntimeError
        If the PDF cannot be opened or a page fails processing.
    """
    try:
        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
    except Exception as exc:
        raise RuntimeError(f"Failed to open PDF: {exc}") from exc

    page_texts: list[str] = []

    for page_num in range(doc.page_count):
        page = doc.load_page(page_num)
        text = _extract_page_text(page, page_num)
        if text:
            page_texts.append(text)

    doc.close()
    return "\n\n".join(page_texts)


def _extract_page_text(page: pymupdf.Page, page_num: int) -> str:
    """
    Extract text from a single page using the dual-path strategy.
    """
    # ── Try native text first ──────────────────────────────────────
    native_text = page.get_text().strip()
    if len(native_text) > NATIVE_TEXT_THRESHOLD:
        return native_text

    # ── Fallback: rasterise → preprocess → OCR ────────────────────
    try:
        zoom = RENDER_DPI / 72  # 72 is the default PDF DPI
        mat = pymupdf.Matrix(zoom, zoom)
        pix = page.get_pixmap(matrix=mat)
        img_bytes = pix.tobytes("png")

        pil_image = preprocess_image(img_bytes)
        ocr_text = extract_text(pil_image)
        return ocr_text
    except Exception as exc:
        # Return whatever native text we had, even if sparse
        return native_text or f"[Page {page_num + 1}: extraction failed — {exc}]"
