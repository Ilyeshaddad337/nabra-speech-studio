"""WAV encoding and a small on-disk store for generated clips."""
from __future__ import annotations

import io
import threading
import time
import uuid
import wave
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np


def to_wav_bytes(audio: np.ndarray, sample_rate: int) -> bytes:
    """float32 [-1, 1] mono -> 16-bit PCM WAV container."""
    samples = np.asarray(audio, dtype=np.float32).reshape(-1)
    samples = np.nan_to_num(samples, nan=0.0, posinf=0.0, neginf=0.0)
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    if peak > 1.0:                       # ISTFT output can overshoot slightly
        samples = samples / peak
    pcm = (samples * 32767.0).astype("<i2")

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm.tobytes())
    return buf.getvalue()


@dataclass
class Clip:
    clip_id: str
    path: Path
    created_at: float
    meta: dict[str, Any] = field(default_factory=dict)


class ClipStore:
    """Keeps generated WAVs on disk so the browser can stream and re-download
    them, and prunes by age and count so a long session cannot fill the disk."""

    def __init__(self, directory: Path, ttl_seconds: int, max_clips: int):
        self.dir = Path(directory)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.ttl = ttl_seconds
        self.max_clips = max_clips
        self._clips: dict[str, Clip] = {}
        self._lock = threading.Lock()

    def put(self, wav_bytes: bytes, meta: dict[str, Any] | None = None) -> Clip:
        clip_id = uuid.uuid4().hex
        path = self.dir / f"{clip_id}.wav"
        path.write_bytes(wav_bytes)
        clip = Clip(clip_id=clip_id, path=path, created_at=time.time(), meta=meta or {})
        with self._lock:
            self._clips[clip_id] = clip
        self.prune()
        return clip

    def get(self, clip_id: str) -> Clip | None:
        with self._lock:
            clip = self._clips.get(clip_id)
        if clip and clip.path.exists():
            return clip
        return None

    def prune(self) -> None:
        cutoff = time.time() - self.ttl
        with self._lock:
            expired = [c for c in self._clips.values() if c.created_at < cutoff]
            keep = sorted(
                (c for c in self._clips.values() if c.created_at >= cutoff),
                key=lambda c: c.created_at,
                reverse=True,
            )
            overflow = keep[self.max_clips:]
            for clip in (*expired, *overflow):
                self._clips.pop(clip.clip_id, None)
        for clip in (*expired, *overflow):
            clip.path.unlink(missing_ok=True)
