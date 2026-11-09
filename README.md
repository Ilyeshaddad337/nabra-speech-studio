# Nabra Speech Studio

Arabic text-to-speech on [`oddadmix/Nabra-7M-Distill`](https://huggingface.co/oddadmix/Nabra-7M-Distill)
— a 7.48M-parameter Kokoro/StyleTTS2 student, 24 kHz, Modern Standard Arabic — behind a FastAPI
service with a React front end.

Measured on this machine (CPU, 4 threads): **3.55 s of audio in 0.25 s → RTF ≈ 0.07**, ~13 s cold
start including the weight download.

```
frontend/  Vite + React SPA (RTL, waveform player, render history)
backend/   FastAPI + PyTorch, loads the model from the HF snapshot
```

## Quick start

```bash
./setup.sh          # venv + pip deps + npm deps  (WITH_DIACRITIZER=1 adds camel-tools)
./run.sh            # API on :8000, UI on :5173
```

Open <http://localhost:5173>. The first request after boot waits on the model: weights download to
`~/.cache/huggingface` once (~29 MB) and the UI polls `/api/status` until it flips to `ready`.

Single-origin deployment (no Vite, no CORS):

```bash
cd frontend && npm run build          # emits frontend/dist
cd ../backend && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The API mounts `frontend/dist` at `/` when that build exists.

### Python version

The G2P chain (`misaki` → `spacy`) publishes no wheels for Python 3.13+, so the backend needs
**Python 3.10–3.12**. `setup.sh` picks one up if present and otherwise provisions 3.12 with `uv`.
No system `espeak-ng` package is needed — `espeakng-loader` ships the library and its data.

## How the model is driven

`backend/app/tts.py` mirrors the model card's `load_model.py` rather than pip-installing `kokoro`:

1. `snapshot_download` fetches weights, config, the voice pack `af_msa.pt`, `arabic_g2p.py`, and the
   vendored `kokoro_patched/` (stock Kokoro hardcodes decoder widths this config overrides).
2. `KModel(...)` is built from that snapshot, then `vocab` is patched with `ʕ`/`ħ` on slots 7/8 —
   the pharyngeals were trained into those vocab gaps.
3. `KPipeline(lang_code="ar")`'s raw espeak front end is replaced with the repo's `ArabicG2P`:
   normalize → tashkeel → espeak IPA → `clean_phonemes` (strips espeak's syllable dots, which
   Kokoro would otherwise voice as pauses).

Long input is chunked by the pipeline on `\n` and sentence boundaries; the chunks are concatenated
with a 60 ms gap, and each chunk's text and IPA come back in the response.

**Tashkeel matters.** Undiacritized text is auto-diacritized only if `camel-tools` is installed;
otherwise espeak guesses the short vowels and prosody suffers. Either install it
(`WITH_DIACRITIZER=1 ./setup.sh`, ~1 GB of model data) or write the input diacritized. The UI shows
which mode is live under `TASHKEEL`.

## API

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness. |
| `GET` | `/api/status` | Engine state, device, param count, limits, diacritizer availability. |
| `POST` | `/api/load` | Force a (re)load — useful with `NABRA_PRELOAD=0` or after an error. |
| `POST` | `/api/tts` | `{text, speed}` → clip id, URLs, timing, per-chunk phonemes. |
| `GET` | `/api/audio/{id}.wav` | The rendered clip; `?download=1` sets an attachment header. |
| `POST` | `/api/phonemize` | Preview of normalization, tashkeel, and IPA without synthesizing. |
| `GET` | `/api/samples` | Example sentences shown as presets in the UI. |

```bash
curl -s -X POST localhost:8000/api/tts -H 'Content-Type: application/json' \
  -d '{"text":"مَرْحَبًا بِكُم","speed":1.0}'
```

Clips live in `~/.cache/nabra-tts/clips` and are pruned by age and count, so treat the URLs as
short-lived. Interactive docs: <http://localhost:8000/docs>.

## Configuration

| Variable | Default | Meaning |
|---|---|---|
| `NABRA_REPO_ID` | `oddadmix/Nabra-7M-Distill` | Model repo (the 82M teacher also loads through the patched package). |
| `NABRA_DEVICE` | auto | `cpu` or `cuda`. |
| `NABRA_TORCH_THREADS` | `4` | Torch intra-op threads. |
| `NABRA_PRELOAD` | `1` | Load weights at startup instead of on first request. |
| `NABRA_DIACRITIZE` | `1` | Run the camel-tools diacritizer when available. |
| `NABRA_MAX_CHARS` | `3000` | Per-request text cap. |
| `NABRA_MAX_CONCURRENCY` | `2` | Worker threads; inference itself is serialized. |
| `NABRA_CLIP_TTL` / `NABRA_MAX_CLIPS` | `3600` / `200` | Clip retention. |
| `NABRA_CLIP_DIR` | `~/.cache/nabra-tts/clips` | Where WAVs are written. |
| `NABRA_CORS_ORIGINS` | `localhost:5173,127.0.0.1:5173` | Comma-separated allowed origins. |
| `NABRA_FRONTEND_DIST` | `frontend/dist` | Static bundle to serve at `/`. |

## UI notes

- `Ctrl/Cmd + Enter` generates; presets fill the textarea; the speed rail spans 0.5×–2×.
- The waveform is decoded client-side via `AudioContext` — click it to seek.
- **الفونيمات** calls `/api/phonemize`, so you can inspect the diacritization and IPA before
  committing to a render.
- The render history keeps the last 12 clips in memory with replay, text reuse, and WAV download.

## Limitations

Single voice (`af_msa`), MSA only — dialects are out of scope for this checkpoint. Latin runs and
bracketed citations are dropped by the front end before phonemization.
