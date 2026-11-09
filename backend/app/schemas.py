"""Request/response models for the HTTP API."""
from __future__ import annotations

from pydantic import BaseModel, Field

from .config import settings


class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=settings.max_chars)
    speed: float = Field(1.0, ge=settings.min_speed, le=settings.max_speed)


class SegmentOut(BaseModel):
    text: str
    phonemes: str
    seconds: float


class TTSResponse(BaseModel):
    id: str
    url: str
    download_url: str
    sample_rate: int
    audio_seconds: float
    synth_seconds: float
    rtf: float
    speed: float
    diacritized: str | None = None
    segments: list[SegmentOut]


class PhonemizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=settings.max_chars)


class PhonemizeResponse(BaseModel):
    normalized: str
    diacritized: str
    phonemes: str
    already_diacritized: bool
    latin_runs_dropped: int


class StatusResponse(BaseModel):
    state: str
    device: str | None = None
    repo_id: str
    parameters: int | None = None
    sample_rate: int
    voice: str = "af_msa"
    language: str = "Modern Standard Arabic"
    diacritizer: bool = False
    load_seconds: float | None = None
    max_chars: int
    min_speed: float
    max_speed: float
    error: str | None = None
