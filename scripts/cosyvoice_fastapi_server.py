#!/usr/bin/env python3
import argparse
import logging
import os
import sys
import tempfile
import time
import traceback
import uuid

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

logging.getLogger("matplotlib").setLevel(logging.WARNING)

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(ROOT_DIR)
COSYVOICE_ROOT = os.path.join(REPO_ROOT, "vendor", "CosyVoice")

sys.path.append(COSYVOICE_ROOT)
sys.path.append(os.path.join(COSYVOICE_ROOT, "third_party", "Matcha-TTS"))

from cosyvoice.cli.cosyvoice import AutoModel  # noqa: E402

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


LOGGER = logging.getLogger("speechify.cosyvoice")


def create_request_id():
    return uuid.uuid4().hex[:8]


def summarize_text(text: str) -> str:
    normalized = " ".join((text or "").split())
    if len(normalized) <= 60:
        return normalized
    return f"{normalized[:57]}..."


def collect_audio_bytes(model_output, cleanup_paths=None, request_id=None, route_name=None):
    chunks = []
    started_at = time.perf_counter()
    first_chunk_at = None
    try:
        for item in model_output:
            if first_chunk_at is None:
                first_chunk_at = time.perf_counter()
                LOGGER.info(
                    "[%s] %s first audio chunk after %.0fms",
                    request_id or "-",
                    route_name or "inference",
                    (first_chunk_at - started_at) * 1000,
                )
            tts_audio = (item["tts_speech"].numpy() * (2**15)).astype(np.int16).tobytes()
            chunks.append(tts_audio)
        audio_bytes = b"".join(chunks)
        LOGGER.info(
            "[%s] %s collected %d chunks, %d bytes in %.0fms",
            request_id or "-",
            route_name or "inference",
            len(chunks),
            len(audio_bytes),
            (time.perf_counter() - started_at) * 1000,
        )
        return audio_bytes
    except Exception:
        LOGGER.error("[%s] CosyVoice inference failed while collecting audio bytes.\n%s", request_id or "-", traceback.format_exc())
        raise
    finally:
        if cleanup_paths:
            for cleanup_path in cleanup_paths:
                if cleanup_path and os.path.exists(cleanup_path):
                    os.remove(cleanup_path)


async def save_upload_to_temp_wav(upload: UploadFile) -> str:
    upload.file.seek(0)
    payload = await upload.read()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_file.write(payload)
        temp_file.flush()
        return temp_file.name


@app.get("/inference_sft")
@app.post("/inference_sft")
async def inference_sft(tts_text: str = Form(), spk_id: str = Form()):
    request_id = create_request_id()
    started_at = time.perf_counter()
    LOGGER.info("[%s] inference_sft received textLength=%d spk_id=%s", request_id, len(tts_text), spk_id)
    model_output = cosyvoice.inference_sft(tts_text, spk_id)
    audio_bytes = collect_audio_bytes(model_output, request_id=request_id, route_name="inference_sft")
    LOGGER.info("[%s] inference_sft completed in %.0fms", request_id, (time.perf_counter() - started_at) * 1000)
    return Response(content=audio_bytes, media_type="application/octet-stream")


@app.get("/inference_zero_shot")
@app.post("/inference_zero_shot")
async def inference_zero_shot(tts_text: str = Form(), prompt_text: str = Form(), prompt_wav: UploadFile = File()):
    request_id = create_request_id()
    started_at = time.perf_counter()
    LOGGER.info(
        "[%s] inference_zero_shot received textLength=%d promptTextLength=%d preview=%s",
        request_id,
        len(tts_text),
        len(prompt_text),
        summarize_text(tts_text),
    )
    prompt_wav_path = await save_upload_to_temp_wav(prompt_wav)
    LOGGER.info("[%s] inference_zero_shot saved prompt audio to %s", request_id, prompt_wav_path)
    LOGGER.info("[%s] inference_zero_shot starting model inference", request_id)
    model_output = cosyvoice.inference_zero_shot(tts_text, prompt_text, prompt_wav_path)
    audio_bytes = collect_audio_bytes(
        model_output,
        cleanup_paths=[prompt_wav_path],
        request_id=request_id,
        route_name="inference_zero_shot",
    )
    LOGGER.info("[%s] inference_zero_shot completed in %.0fms", request_id, (time.perf_counter() - started_at) * 1000)
    return Response(
        content=audio_bytes,
        media_type="application/octet-stream",
    )


@app.get("/inference_cross_lingual")
@app.post("/inference_cross_lingual")
async def inference_cross_lingual(tts_text: str = Form(), prompt_wav: UploadFile = File()):
    request_id = create_request_id()
    started_at = time.perf_counter()
    LOGGER.info(
        "[%s] inference_cross_lingual received textLength=%d preview=%s",
        request_id,
        len(tts_text),
        summarize_text(tts_text),
    )
    prompt_wav_path = await save_upload_to_temp_wav(prompt_wav)
    LOGGER.info("[%s] inference_cross_lingual saved prompt audio to %s", request_id, prompt_wav_path)
    LOGGER.info("[%s] inference_cross_lingual starting model inference", request_id)
    model_output = cosyvoice.inference_cross_lingual(tts_text, prompt_wav_path)
    audio_bytes = collect_audio_bytes(
        model_output,
        cleanup_paths=[prompt_wav_path],
        request_id=request_id,
        route_name="inference_cross_lingual",
    )
    LOGGER.info("[%s] inference_cross_lingual completed in %.0fms", request_id, (time.perf_counter() - started_at) * 1000)
    return Response(
        content=audio_bytes,
        media_type="application/octet-stream",
    )


@app.get("/inference_instruct")
@app.post("/inference_instruct")
async def inference_instruct(tts_text: str = Form(), spk_id: str = Form(), instruct_text: str = Form()):
    request_id = create_request_id()
    started_at = time.perf_counter()
    LOGGER.info("[%s] inference_instruct received textLength=%d spk_id=%s", request_id, len(tts_text), spk_id)
    model_output = cosyvoice.inference_instruct(tts_text, spk_id, instruct_text)
    audio_bytes = collect_audio_bytes(model_output, request_id=request_id, route_name="inference_instruct")
    LOGGER.info("[%s] inference_instruct completed in %.0fms", request_id, (time.perf_counter() - started_at) * 1000)
    return Response(content=audio_bytes, media_type="application/octet-stream")


@app.get("/inference_instruct2")
@app.post("/inference_instruct2")
async def inference_instruct2(tts_text: str = Form(), instruct_text: str = Form(), prompt_wav: UploadFile = File()):
    request_id = create_request_id()
    started_at = time.perf_counter()
    LOGGER.info("[%s] inference_instruct2 received textLength=%d", request_id, len(tts_text))
    prompt_wav_path = await save_upload_to_temp_wav(prompt_wav)
    LOGGER.info("[%s] inference_instruct2 saved prompt audio to %s", request_id, prompt_wav_path)
    LOGGER.info("[%s] inference_instruct2 starting model inference", request_id)
    model_output = cosyvoice.inference_instruct2(tts_text, instruct_text, prompt_wav_path)
    audio_bytes = collect_audio_bytes(
        model_output,
        cleanup_paths=[prompt_wav_path],
        request_id=request_id,
        route_name="inference_instruct2",
    )
    LOGGER.info("[%s] inference_instruct2 completed in %.0fms", request_id, (time.perf_counter() - started_at) * 1000)
    return Response(
        content=audio_bytes,
        media_type="application/octet-stream",
    )


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=50000)
    parser.add_argument(
        "--model_dir",
        type=str,
        default="iic/CosyVoice-300M",
        help="local path or modelscope repo id",
    )
    args = parser.parse_args()
    cosyvoice = AutoModel(model_dir=args.model_dir)
    uvicorn.run(app, host="0.0.0.0", port=args.port)
