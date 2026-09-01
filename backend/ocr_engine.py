"""
ocr_engine.py
─────────────
Tesseract OCR wrapper with text sanitization.
"""

from __future__ import annotations

import re
import pytesseract
from PIL import Image


# Default Tesseract page-segmentation mode
DEFAULT_PSM: int = 6  # Assume a single uniform block of text


def extract_text(image: Image.Image, psm: int = DEFAULT_PSM) -> str:
    """
    Run Tesseract OCR on a preprocessed PIL Image.

    Parameters
    ----------
    image : PIL.Image.Image
        Preprocessed (binarised / grayscale) image.
    psm : int
        Page segmentation mode passed to Tesseract.

    Returns
    -------
    str
        Sanitized plain-text output.
    """
    config = f"--psm {psm}"
    raw_text: str = pytesseract.image_to_string(image, config=config)
    return _sanitize(raw_text)


def _sanitize(text: str) -> str:
    """
    Clean up raw Tesseract output.

    • Strip leading/trailing whitespace
    • Remove non-printable / control characters (keep newlines & tabs)
    • Collapse runs of 3+ newlines into 2
    • Collapse runs of 2+ spaces/tabs into 1
    """
    # Remove control chars except \n, \r, \t
    text = re.sub(r"[^\S\n\r\t]", " ", text)          # normalise exotic whitespace
    text = re.sub(r"[^\x20-\x7E\n\r\t]", "", text)    # strip non-printable
    text = re.sub(r"[ \t]{2,}", " ", text)             # collapse horizontal whitespace
    text = re.sub(r"\n{3,}", "\n\n", text)             # collapse excessive newlines
    return text.strip()
