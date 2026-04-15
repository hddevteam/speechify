#!/usr/bin/env python3
import argparse
import logging
import os
import sys
import tempfile

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

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


def generate_data(model_output, cleanup_paths=None):
    try:
        for item in model_output:
            tts_audio = (item["tts_speech"].numpy() * (2**15)).astype(np.int16).tobytes()
            yield tts_audio
    finally:
        if cleanup_paths:
            for cleanup_path in cleanup_paths:
                if cleanup_path and os.path.exists(cleanup_path):
                    os.remove(cleanup_path)


async def save_upload_to_temp_wav(upload: UploadFile) -> str:
    upload.file.seek(0)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as temp_file:
        temp_file.write(await upload.read())
        temp_file.flush()
        return temp_file.name


@app.get("/inference_sft")
@app.post("/inference_sft")
async def inference_sft(tts_text: str = Form(), spk_id: str = Form()):
    model_output = cosyvoice.inference_sft(tts_text, spk_id)
    return StreamingResponse(generate_data(model_output))


@app.get("/inference_zero_shot")
@app.post("/inference_zero_shot")
async def inference_zero_shot(tts_text: str = Form(), prompt_text: str = Form(), prompt_wav: UploadFile = File()):
    prompt_wav_path = await save_upload_to_temp_wav(prompt_wav)
    model_output = cosyvoice.inference_zero_shot(tts_text, prompt_text, prompt_wav_path)
    return StreamingResponse(generate_data(model_output, cleanup_paths=[prompt_wav_path]))


@app.get("/inference_cross_lingual")
@app.post("/inference_cross_lingual")
async def inference_cross_lingual(tts_text: str = Form(), prompt_wav: UploadFile = File()):
    prompt_wav_path = await save_upload_to_temp_wav(prompt_wav)
    model_output = cosyvoice.inference_cross_lingual(tts_text, prompt_wav_path)
    return StreamingResponse(generate_data(model_output, cleanup_paths=[prompt_wav_path]))


@app.get("/inference_instruct")
@app.post("/inference_instruct")
async def inference_instruct(tts_text: str = Form(), spk_id: str = Form(), instruct_text: str = Form()):
    model_output = cosyvoice.inference_instruct(tts_text, spk_id, instruct_text)
    return StreamingResponse(generate_data(model_output))


@app.get("/inference_instruct2")
@app.post("/inference_instruct2")
async def inference_instruct2(tts_text: str = Form(), instruct_text: str = Form(), prompt_wav: UploadFile = File()):
    prompt_wav_path = await save_upload_to_temp_wav(prompt_wav)
    model_output = cosyvoice.inference_instruct2(tts_text, instruct_text, prompt_wav_path)
    return StreamingResponse(generate_data(model_output, cleanup_paths=[prompt_wav_path]))


if __name__ == "__main__":
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
