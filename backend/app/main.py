"""FastAPI service exposing Nabra-7M-Distill as a text-to-speech API."""
from __future__ import annotations

import asyncio
import logging
import threading
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .audio import ClipStore, to_wav_bytes
from .config import settings
from .schemas import (
    PhonemizeRequest,
    PhonemizeResponse,
    SegmentOut,
    StatusResponse,
    TTSRequest,
    TTSResponse,
)
from .tts import SAMPLE_RATE, ModelNotReady, engine

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("nabra.api")

clips = ClipStore(settings.clip_dir, settings.clip_ttl_seconds, settings.max_clips)
pool = ThreadPoolExecutor(max_workers=max(1, settings.max_concurrency), thread_name_prefix="tts")

SAMPLES = [
    {"label": "ترحيب", "text": "مَرْحَبًا بِكُم فِي عَالَمِ تَحْوِيلِ النَّصِّ إِلَى كَلَام."},
    {"label": "إعلان", "text": "عَرْضٌ خَاصٌّ لِفَتْرَةٍ مَحْدُودَة: خَصْمُ خَمْسِينَ بِالمِئَةِ عَلَى جَمِيعِ المُنْتَجَات."},
    {"label": "بدون تشكيل", "text": "الذكاء الاصطناعي يغير طريقة عملنا في كل يوم."},
    {"label": "خبر", "text": "أَعْلَنَتِ الشَّرِكَةُ اليَوْمَ عَنْ إِطْلَاقِ نُسْخَةٍ جَدِيدَةٍ مِنْ تَطْبِيقِهَا."},
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.preload:
        threading.Thread(target=_safe_load, name="model-preload", daemon=True).start()
    yield
    pool.shutdown(wait=False, cancel_futures=True)


def _safe_load() -> None:
    try:
        engine.load()
    except Exception:                                        # noqa: BLE001
        log.error("preload failed; /api/status carries the error")


app = FastAPI(
    title="Nabra TTS",
    description="Arabic text-to-speech on oddadmix/Nabra-7M-Distill (7.48M params, 24 kHz).",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins) or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)


async def _run(fn, *args):
    """Run blocking torch work off the event loop."""
    return await asyncio.get_running_loop().run_in_executor(pool, fn, *args)


@app.get("/api/health")
async def health():
    return {"status": "ok", "state": engine.status.state}


@app.get("/api/status", response_model=StatusResponse)
async def status():
    s = engine.status
    return StatusResponse(
        state=s.state,
        device=s.device,
        repo_id=s.repo_id,
        parameters=s.parameters,
        sample_rate=SAMPLE_RATE,
        diacritizer=s.diacritizer,
        load_seconds=s.load_seconds,
        max_chars=settings.max_chars,
        min_speed=settings.min_speed,
        max_speed=settings.max_speed,
        error=s.error,
    )


@app.get("/api/samples")
async def samples():
    return SAMPLES


@app.post("/api/load", response_model=StatusResponse)
async def load_model():
    """Force a load (useful when NABRA_PRELOAD=0 or a previous load errored)."""
    try:
        await _run(engine.load)
    except Exception as exc:                                 # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return await status()


@app.post("/api/tts", response_model=TTSResponse)
async def tts(req: TTSRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=422, detail="Text is empty.")
    try:
        result = await _run(engine.synthesize, text, req.speed)
    except ModelNotReady as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:                                 # noqa: BLE001
        log.exception("synthesis failed")
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {exc}") from exc

    clip = clips.put(
        to_wav_bytes(result.audio, result.sample_rate),
        meta={"text": text, "speed": req.speed},
    )
    return TTSResponse(
        id=clip.clip_id,
        url=f"/api/audio/{clip.clip_id}.wav",
        download_url=f"/api/audio/{clip.clip_id}.wav?download=1",
        sample_rate=result.sample_rate,
        audio_seconds=round(result.audio_seconds, 3),
        synth_seconds=round(result.synth_seconds, 3),
        rtf=round(result.rtf, 4),
        speed=req.speed,
        diacritized=result.diacritized,
        segments=[SegmentOut(text=s.text, phonemes=s.phonemes, seconds=round(s.seconds, 3))
                  for s in result.segments],
    )


@app.post("/api/phonemize", response_model=PhonemizeResponse)
async def phonemize(req: PhonemizeRequest):
    try:
        return PhonemizeResponse(**await _run(engine.analyze, req.text.strip()))
    except ModelNotReady as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:                                 # noqa: BLE001
        log.exception("phonemize failed")
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/audio/{clip_id}.wav")
async def audio(clip_id: str, download: int = 0):
    clip = clips.get(clip_id)
    if clip is None:
        raise HTTPException(status_code=404, detail="Clip expired or not found.")
    headers = {"Cache-Control": "private, max-age=3600"}
    if download:
        headers["Content-Disposition"] = f'attachment; filename="nabra-{clip_id[:8]}.wav"'
    return FileResponse(clip.path, media_type="audio/wav", headers=headers)


# Serve the built React app from the same origin when `npm run build` has run.
_dist = settings.frontend_dist
if _dist and (_dist / "index.html").exists():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
    log.info("serving frontend from %s", _dist)
