#!/usr/bin/env python3
"""
Resource benchmark (RAM + CPU) for Qwen3-TTS and CosyVoice-300M.

Usage:
  python scripts/benchmark-resources.py

Requires:
  - CosyVoice FastAPI server running at :50000
  - psutil installed in both venvs, or system Python:
      pip install psutil  (system)
      vendor/CosyVoice/.venv310/bin/pip install psutil
      vendor/Qwen3-TTS/.venv312/bin/pip install psutil
"""
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
import wave
from pathlib import Path

try:
    import psutil
except ImportError:
    print("Installing psutil ...", flush=True)
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psutil", "-q"])
    import psutil

# ── paths ─────────────────────────────────────────────────────────────────────
SPEECHIFY_ROOT = Path(__file__).parent.parent
QWEN_PYTHON = str(SPEECHIFY_ROOT / "vendor/Qwen3-TTS/.venv312/bin/python")
QWEN_MODEL   = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16"
COSY_URL     = "http://127.0.0.1:50000/inference_zero_shot"
REF_AUDIO    = (
    "/Users/ming/Library/CloudStorage/OneDrive-HDDevTeam/Recording/artifacts"
    "/2025-python-for-non-programmers/.speechify/reference-audio"
    "/5986247_Python_01_02_part2_reference.wav"
)

# medium-length text is representative
BENCH_TEXT = (
    "Python is a versatile programming language widely used in data science, "
    "web development, automation, and artificial intelligence. "
    "Its clean syntax makes it an excellent choice for beginners and experts alike."
)
RESULT_MARKER = "SPEECHIFY_QWEN_RESULT="


# ── helpers ───────────────────────────────────────────────────────────────────
def poll_process(pid: int, interval: float, stop: threading.Event) -> dict:
    """Poll a process for memory RSS (MB) and CPU% until stop is set."""
    rss_samples, cpu_samples = [], []
    try:
        proc = psutil.Process(pid)
        # first call primes the CPU counter
        proc.cpu_percent(interval=None)
        while not stop.is_set():
            try:
                mem_mb = proc.memory_info().rss / 1024 / 1024
                cpu    = proc.cpu_percent(interval=None)
                rss_samples.append(mem_mb)
                cpu_samples.append(cpu)
            except psutil.NoSuchProcess:
                break
            time.sleep(interval)
    except psutil.NoSuchProcess:
        pass
    return {
        "peak_ram_mb":  max(rss_samples) if rss_samples else 0,
        "idle_ram_mb":  rss_samples[0]   if rss_samples else 0,
        "avg_cpu_pct":  sum(cpu_samples) / len(cpu_samples) if cpu_samples else 0,
        "peak_cpu_pct": max(cpu_samples) if cpu_samples else 0,
        "samples":      len(rss_samples),
    }


def find_cosyvoice_pid() -> int | None:
    """Find the PID of the CosyVoice FastAPI server by port 50000 via lsof."""
    try:
        out = subprocess.check_output(
            ["lsof", "-i", ":50000", "-sTCP:LISTEN", "-t"],
            stderr=subprocess.DEVNULL, text=True
        ).strip()
        if out:
            return int(out.splitlines()[0])
    except (subprocess.CalledProcessError, ValueError):
        pass
    # fallback: search by cmdline
    for proc in psutil.process_iter(["pid", "cmdline"]):
        try:
            cmd = " ".join(proc.info["cmdline"] or [])
            if "cosyvoice_fastapi_server" in cmd:
                return proc.info["pid"]
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return None


def cosyvoice_request():
    """Send one synthesis request to CosyVoice server (blocking)."""
    boundary = "----FormBoundary7MA4YWxkTrZu0gW"
    with open(REF_AUDIO, "rb") as f:
        audio_data = f.read()
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="tts_text"\r\n\r\n'
        f"{BENCH_TEXT}\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="prompt_text"\r\n\r\n'
        f"\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="prompt_wav"; filename="ref.wav"\r\n'
        f"Content-Type: audio/wav\r\n\r\n"
    ).encode() + audio_data + f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        COSY_URL,
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        resp.read()


# ── CosyVoice resource benchmark ─────────────────────────────────────────────
def benchmark_cosyvoice() -> dict:
    pid = find_cosyvoice_pid()
    if pid is None:
        print("  ✗ CosyVoice server not running on :50000. Start it first.", flush=True)
        return {}
    print(f"  CosyVoice server PID={pid}", flush=True)

    # idle baseline (1s sample before request)
    proc = psutil.Process(pid)
    proc.cpu_percent(interval=None)  # prime
    time.sleep(1.0)
    idle_ram_mb = proc.memory_info().rss / 1024 / 1024

    # start polling thread
    stop_evt = threading.Event()
    result_holder: dict = {}

    def poller():
        result_holder.update(poll_process(pid, interval=0.3, stop=stop_evt))

    t = threading.Thread(target=poller, daemon=True)
    t.start()

    # run synthesis
    wall_t0 = time.time()
    cosyvoice_request()
    wall = time.time() - wall_t0

    stop_evt.set()
    t.join(timeout=5)

    stats = result_holder
    stats["idle_ram_mb"] = idle_ram_mb
    stats["wall_s"] = wall
    return stats


# ── Qwen3-TTS resource benchmark ─────────────────────────────────────────────
QWEN_SCRIPT = """
import json, os, sys, tempfile, time, wave
import numpy as np
from mlx_audio.tts.utils import load_model

RESULT_MARKER = "SPEECHIFY_QWEN_RESULT="
model_name = sys.argv[1]
text       = sys.argv[2]
ref_audio  = sys.argv[3]

model = load_model(model_name)
t0 = time.time()
results = list(model.generate(text=text, ref_audio=ref_audio, x_vector_only_mode=True))
wall = time.time() - t0
if not results:
    raise RuntimeError("no audio")
audio = np.asarray(results[0].audio, dtype=np.float32).reshape(-1)
audio = np.clip(audio, -1.0, 1.0)
pcm   = (audio * 32767.0).astype(np.int16)
sr    = int(getattr(model, "sample_rate", 24000))
fd, out = tempfile.mkstemp(prefix="bench-qwen-", suffix=".wav")
os.close(fd)
with wave.open(out, "wb") as wf:
    wf.setnchannels(1); wf.setsampwidth(2); wf.setframerate(sr)
    wf.writeframes(pcm.tobytes())
print(RESULT_MARKER + json.dumps({"audioPath": out, "sampleRate": sr,
      "frameCount": int(pcm.shape[0]), "wall_s": wall}), flush=True)
"""


def benchmark_qwen() -> dict:
    print(f"  Launching Qwen3-TTS subprocess ...", flush=True)
    proc = psutil.Popen(
        [QWEN_PYTHON, "-c", QWEN_SCRIPT, QWEN_MODEL, BENCH_TEXT, REF_AUDIO],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    pid = proc.pid
    print(f"  Qwen3-TTS PID={pid}", flush=True)

    wall_t0 = time.time()
    stop_evt = threading.Event()
    result_holder: dict = {}

    def poller():
        result_holder.update(poll_process(pid, interval=0.3, stop=stop_evt))

    t = threading.Thread(target=poller, daemon=True)
    t.start()

    stdout, stderr = proc.communicate(timeout=600)

    stop_evt.set()
    t.join(timeout=5)

    wall = time.time() - wall_t0

    stats = result_holder
    stats["wall_s"] = wall

    # parse output
    for line in stdout.splitlines():
        if RESULT_MARKER in line:
            data = json.loads(line.split(RESULT_MARKER, 1)[1])
            audio_path = data.get("audioPath", "")
            if audio_path and os.path.exists(audio_path):
                os.unlink(audio_path)
            break

    if proc.returncode != 0 and stderr:
        last_err = "\n".join(stderr.strip().splitlines()[-3:])
        print(f"  stderr (last 3 lines): {last_err}", flush=True)

    return stats


# ── main ──────────────────────────────────────────────────────────────────────
def fmt(stats: dict) -> str:
    if not stats:
        return "  (unavailable)"
    return (
        f"  Idle RAM:   {stats.get('idle_ram_mb', 0):.0f} MB\n"
        f"  Peak RAM:   {stats.get('peak_ram_mb', 0):.0f} MB\n"
        f"  Avg CPU:    {stats.get('avg_cpu_pct', 0):.0f}%\n"
        f"  Peak CPU:   {stats.get('peak_cpu_pct', 0):.0f}%\n"
        f"  Wall time:  {stats.get('wall_s', 0):.1f}s\n"
        f"  Samples:    {stats.get('samples', 0)}"
    )


def main():
    print("=" * 60)
    print(f"Resource Benchmark — Apple M3 Max 64GB")
    print(f"Text: {len(BENCH_TEXT)} chars (medium)")
    print("=" * 60)

    print("\n[1/2] CosyVoice-300M+MPS")
    cosy = benchmark_cosyvoice()
    print(fmt(cosy))

    print("\n[2/2] Qwen3-TTS 0.6B (MLX)")
    qwen = benchmark_qwen()
    print(fmt(qwen))

    print("\n" + "=" * 60)
    print("Summary (medium text, ~208 chars)")
    print("=" * 60)
    rows = [
        ("Model",           "Idle RAM",  "Peak RAM",  "Avg CPU",  "Wall"),
        ("CosyVoice-300M",
         f"{cosy.get('idle_ram_mb',0):.0f} MB",
         f"{cosy.get('peak_ram_mb',0):.0f} MB",
         f"{cosy.get('avg_cpu_pct',0):.0f}%",
         f"{cosy.get('wall_s',0):.1f}s"),
        ("Qwen3-TTS 0.6B",
         f"{qwen.get('idle_ram_mb',0):.0f} MB",
         f"{qwen.get('peak_ram_mb',0):.0f} MB",
         f"{qwen.get('avg_cpu_pct',0):.0f}%",
         f"{qwen.get('wall_s',0):.1f}s"),
    ]
    col_w = [max(len(r[i]) for r in rows) + 2 for i in range(5)]
    for row in rows:
        print("  " + "".join(v.ljust(col_w[i]) for i, v in enumerate(row)))

    result = {"cosyvoice": cosy, "qwen3tts": qwen}
    out_path = Path(__file__).parent / "benchmark-resources.json"
    with open(out_path, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\nResults saved to {out_path}")


if __name__ == "__main__":
    main()
