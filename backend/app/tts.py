"""Nabra-7M-Distill engine wrapper.

The model is a 7.48M-parameter Kokoro/StyleTTS2 student for Modern Standard
Arabic. Its repo vendors a patched `kokoro` package (the stock one hardcodes the
decoder widths this config overrides), plus `arabic_g2p.py`, which is the exact
text front end the model was trained with. We download the snapshot and load
from it rather than pip-installing `kokoro`, for the same reason the model card
says to use its `load_model.py`.
"""
from __future__ import annotations

import logging
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np

from .config import Settings, settings as default_settings

log = logging.getLogger("nabra.tts")

SAMPLE_RATE = 24_000
# Inserted between chunks so sentence-level chunking does not sound spliced.
JOIN_SILENCE_SECONDS = 0.06


class ModelNotReady(RuntimeError):
    """Raised when a request arrives before the weights finished loading."""


@dataclass
class Segment:
    text: str
    phonemes: str
    seconds: float


@dataclass
class Synthesis:
    audio: np.ndarray
    sample_rate: int
    segments: list[Segment]
    synth_seconds: float
    diacritized: str | None = None

    @property
    def audio_seconds(self) -> float:
        return len(self.audio) / self.sample_rate

    @property
    def rtf(self) -> float:
        """Real-time factor: synthesis time / audio time. Lower is faster."""
        return self.synth_seconds / self.audio_seconds if self.audio_seconds else 0.0


@dataclass
class EngineStatus:
    state: str = "idle"              # idle | loading | ready | error
    device: str | None = None
    repo_id: str = ""
    snapshot: str | None = None
    diacritizer: bool = False
    parameters: int | None = None
    load_seconds: float | None = None
    error: str | None = None
    extras: dict[str, Any] = field(default_factory=dict)


class NabraEngine:
    def __init__(self, settings: Settings = default_settings):
        self.settings = settings
        self.status = EngineStatus(repo_id=settings.repo_id)
        self._load_lock = threading.Lock()
        self._infer_lock = threading.Lock()
        self._model = None
        self._pipeline = None
        self._voice = None
        self._g2p = None

    # ---------------------------------------------------------------- loading

    @property
    def is_ready(self) -> bool:
        return self.status.state == "ready"

    def load(self) -> None:
        """Download (once) and build the model. Safe to call repeatedly."""
        if self.is_ready:
            return
        with self._load_lock:
            if self.is_ready:
                return
            self.status.state = "loading"
            self.status.error = None
            started = time.perf_counter()
            try:
                self._load_unlocked()
            except Exception as exc:                        # noqa: BLE001
                self.status.state = "error"
                self.status.error = f"{type(exc).__name__}: {exc}"
                log.exception("model load failed")
                raise
            self.status.load_seconds = time.perf_counter() - started
            self.status.state = "ready"
            log.info("model ready in %.1fs on %s", self.status.load_seconds, self.status.device)

    def _load_unlocked(self) -> None:
        from huggingface_hub import snapshot_download

        snapshot = Path(
            snapshot_download(
                repo_id=self.settings.repo_id,
                revision=self.settings.revision,
                allow_patterns=["*.py", "*.json", "*.pth", "*.pt"],
                ignore_patterns=["*.pyc", "*__pycache__*"],
            )
        )
        self.status.snapshot = str(snapshot)

        # The vendored kokoro must win over any pip-installed one, and
        # arabic_g2p lives at the snapshot root.
        for entry in (str(snapshot), str(snapshot / "kokoro_patched")):
            if entry in sys.path:
                sys.path.remove(entry)
        sys.path.insert(0, str(snapshot))
        sys.path.insert(0, str(snapshot / "kokoro_patched"))

        import torch
        from arabic_g2p import EXTRA_SYMBOLS, ArabicG2P
        from kokoro import KModel, KPipeline
        from kokoro import pipeline as kokoro_pipeline

        if self.settings.torch_threads > 0:
            torch.set_num_threads(self.settings.torch_threads)
        device = self.settings.device or ("cuda" if torch.cuda.is_available() else "cpu")

        model = KModel(
            repo_id=self.settings.repo_id,
            config=str(snapshot / "config.json"),
            model=str(snapshot / "kokoro_arabic_7m.pth"),
            disable_complex=True,
        ).eval()
        # ʕ (ع) and ħ (ح) were trained on the vocab's free slots 7/8.
        model.vocab.update(EXTRA_SYMBOLS)
        model = model.to(device)

        kokoro_pipeline.LANG_CODES.setdefault("ar", "ar")
        pipeline = KPipeline(lang_code="ar", repo_id=self.settings.repo_id, model=model)

        # Replace kokoro's raw espeak front end with the repo's Arabic one:
        # normalize -> (camel-tools tashkeel) -> espeak IPA -> vocab fixups.
        g2p = ArabicG2P(diacritize=self.settings.diacritize)
        pipeline.g2p = lambda text: (g2p(text), None)

        self._model, self._pipeline, self._g2p = model, pipeline, g2p
        self._voice = torch.load(snapshot / "af_msa.pt", map_location="cpu", weights_only=True)

        self.status.device = device
        self.status.diacritizer = bool(getattr(g2p, "diac_available", False))
        self.status.parameters = sum(p.numel() for p in model.parameters())
        self.status.extras = {
            "torch": torch.__version__,
            "threads": torch.get_num_threads(),
            "voice": "af_msa",
        }

    # ------------------------------------------------------------- inference

    def analyze(self, text: str) -> dict[str, str]:
        """Show what the front end does to the text before the model sees it."""
        if not self.is_ready:
            raise ModelNotReady(self.status.error or "model is still loading")
        from arabic_g2p import clean_phonemes, is_diacritized, normalize_text

        with self._infer_lock:
            normalized, dropped = normalize_text(text)
            diacritized = self._g2p.diacritize(normalized)
            # `_g2p` is the ArabicG2P instance's espeak backend; reusing it keeps
            # this preview byte-identical to what synthesis phonemizes.
            phonemes = clean_phonemes(self._g2p._g2p(diacritized)[0])
        return {
            "normalized": normalized,
            "diacritized": diacritized,
            "phonemes": phonemes,
            "already_diacritized": is_diacritized(text),
            "latin_runs_dropped": dropped,
        }

    def synthesize(self, text: str, speed: float = 1.0) -> Synthesis:
        if not self.is_ready:
            raise ModelNotReady(self.status.error or "model is still loading")

        import torch
        from arabic_g2p import normalize_text

        started = time.perf_counter()
        segments: list[Segment] = []
        chunks: list[np.ndarray] = []
        silence = np.zeros(int(JOIN_SILENCE_SECONDS * SAMPLE_RATE), dtype=np.float32)

        with self._infer_lock, torch.no_grad():
            for result in self._pipeline(text, voice=self._voice, speed=speed):
                if result.audio is None:
                    continue
                audio = result.audio.detach().cpu().numpy().astype(np.float32)
                if chunks:
                    chunks.append(silence)
                chunks.append(audio)
                segments.append(
                    Segment(
                        text=result.graphemes,
                        phonemes=result.phonemes,
                        seconds=len(audio) / SAMPLE_RATE,
                    )
                )
            diacritized = None
            if self._g2p is not None and self.settings.diacritize:
                diacritized = self._g2p.diacritize(normalize_text(text)[0])

        if not chunks:
            raise ValueError("Nothing to synthesize — the text produced no phonemes.")

        return Synthesis(
            audio=np.concatenate(chunks),
            sample_rate=SAMPLE_RATE,
            segments=segments,
            synth_seconds=time.perf_counter() - started,
            diacritized=diacritized,
        )


engine = NabraEngine()
