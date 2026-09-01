"""
preprocessor.py
───────────────
Image preprocessing pipeline using OpenCV.

Pipeline stages:
  1. Decode raw bytes → OpenCV BGR matrix
  2. Downscale if max dimension > MAX_DIMENSION (preserve aspect ratio)
  3. Convert to grayscale
  4. Bilateral filter (reduce noise, preserve text edges)
  5. Adaptive Gaussian threshold (handle uneven illumination)
  6. Return an optimized PIL Image object
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

# ── Tunable constants ──────────────────────────────────────────────
MAX_DIMENSION: int = 2000  # px — longest edge cap before downscale

# Bilateral filter parameters
BILATERAL_D: int = 9           # Diameter of pixel neighbourhood
BILATERAL_SIGMA_COLOR: float = 75.0
BILATERAL_SIGMA_SPACE: float = 75.0

# Adaptive threshold parameters
ADAPTIVE_BLOCK_SIZE: int = 15  # Must be odd
ADAPTIVE_C: int = 11           # Constant subtracted from mean


def preprocess_image(image_bytes: bytes) -> Image.Image:
    """
    Run the full preprocessing pipeline on raw image bytes.

    Parameters
    ----------
    image_bytes : bytes
        Raw file content (JPEG / PNG / WEBP).

    Returns
    -------
    PIL.Image.Image
        Preprocessed, binarised image ready for OCR.

    Raises
    ------
    ValueError
        If the bytes cannot be decoded into a valid image.
    """
    # ── 1. Decode ──────────────────────────────────────────────────
    arr = np.frombuffer(image_bytes, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image bytes — file may be corrupt.")

    # ── 2. Downscale ───────────────────────────────────────────────
    img = _downscale(img)

    # ── 3. Grayscale ───────────────────────────────────────────────
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # ── 4. Bilateral filter ────────────────────────────────────────
    filtered = cv2.bilateralFilter(
        gray,
        d=BILATERAL_D,
        sigmaColor=BILATERAL_SIGMA_COLOR,
        sigmaSpace=BILATERAL_SIGMA_SPACE,
    )

    # ── 5. Adaptive Gaussian threshold ─────────────────────────────
    binary = cv2.adaptiveThreshold(
        filtered,
        maxValue=255,
        adaptiveMethod=cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        thresholdType=cv2.THRESH_BINARY,
        blockSize=ADAPTIVE_BLOCK_SIZE,
        C=ADAPTIVE_C,
    )

    # ── 6. Convert to PIL ──────────────────────────────────────────
    pil_image = Image.fromarray(binary)
    return pil_image


def _downscale(img: np.ndarray) -> np.ndarray:
    """
    Downscale an image so its longest edge does not exceed MAX_DIMENSION.
    Aspect ratio is preserved exactly.
    """
    h, w = img.shape[:2]
    longest = max(h, w)

    if longest <= MAX_DIMENSION:
        return img

    scale = MAX_DIMENSION / longest
    new_w = int(w * scale)
    new_h = int(h * scale)
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return resized
