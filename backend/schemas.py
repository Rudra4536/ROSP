"""
schemas.py
──────────
Pydantic models for API request / response serialization.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class ProcessingResponse(BaseModel):
    """Standardized response payload emitted after document processing."""

    status: str = Field(
        default="success",
        description="Processing outcome — 'success' or 'error'.",
    )
    filename: str = Field(
        ...,
        description="Original filename of the uploaded document.",
    )
    mime_type: str = Field(
        ...,
        description="Validated MIME type of the uploaded document.",
    )
    byte_size: int = Field(
        ...,
        description="Size of the uploaded document in bytes.",
    )
    extracted_text: str = Field(
        ...,
        description="Clean, normalized plain-text content extracted from the document.",
    )


class ErrorResponse(BaseModel):
    """Error payload returned on processing failure."""

    status: str = Field(default="error")
    detail: str = Field(
        ...,
        description="Human-readable error description.",
    )
