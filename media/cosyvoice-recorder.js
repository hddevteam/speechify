(function () {
  const vscode = acquireVsCodeApi();
  const initialState = window.__INITIAL_STATE__ || {};
  const labels = initialState.labels || {};

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const retryBtn = document.getElementById('retryBtn');
  const saveBtn = document.getElementById('saveBtn');
  const closeBtn = document.getElementById('closeBtn');
  const statusBadge = document.getElementById('statusBadge');
  const durationEl = document.getElementById('duration');
  const previewAudio = document.getElementById('previewAudio');
  const pulse = document.getElementById('pulse');

  let mediaRecorder = null;
  let activeStream = null;
  let recordedChunks = [];
  let recordedBytes = null;
  let previewUrl = null;
  let timerId = null;
  let recordingStartedAt = 0;

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;

  const setStatus = (kind, text) => {
    statusBadge.textContent = text;
    statusBadge.className = `status-badge ${kind}`;
    pulse.className = `pulse ${kind}`;
  };

  const setDuration = (ms) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    durationEl.textContent = `${minutes}:${seconds}`;
  };

  const updateButtons = () => {
    const isRecording = !!mediaRecorder && mediaRecorder.state === 'recording';
    const hasRecording = !!recordedBytes;

    startBtn.disabled = isRecording;
    stopBtn.disabled = !isRecording;
    retryBtn.disabled = isRecording || !hasRecording;
    saveBtn.disabled = isRecording || !hasRecording;
  };

  const stopTimer = () => {
    if (!timerId) {
      return;
    }

    clearInterval(timerId);
    timerId = null;
  };

  const startTimer = () => {
    stopTimer();
    recordingStartedAt = Date.now();
    setDuration(0);
    timerId = setInterval(() => {
      setDuration(Date.now() - recordingStartedAt);
    }, 200);
  };

  const cleanupPreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }

    previewAudio.removeAttribute('src');
    previewAudio.load();
  };

  const resetRecording = () => {
    recordedBytes = null;
    recordedChunks = [];
    cleanupPreview();
    setDuration(0);
    setStatus('idle', labels.idle);
    updateButtons();
  };

  const pickMimeType = () => {
    const candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4'
    ];

    for (const candidate of candidates) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidate)) {
        return candidate;
      }
    }

    return '';
  };

  const stopStream = () => {
    if (!activeStream) {
      return;
    }

    for (const track of activeStream.getTracks()) {
      track.stop();
    }
    activeStream = null;
  };

  const ensureStream = async () => {
    if (activeStream && activeStream.active) {
      return activeStream;
    }

    activeStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        noiseSuppression: true,
        echoCancellation: true
      }
    });
    return activeStream;
  };

  const encodeWav = (audioBuffer) => {
    const sampleRate = audioBuffer.sampleRate;
    const channelCount = 1;
    const samples = audioBuffer.length;
    const dataSize = samples * 2;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset, value) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channelCount * 2, true);
    view.setUint16(32, channelCount * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    const channelData = audioBuffer.numberOfChannels === 1
      ? audioBuffer.getChannelData(0)
      : mixToMono(audioBuffer);

    let offset = 44;
    for (let index = 0; index < channelData.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, channelData[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    return new Uint8Array(buffer);
  };

  const mixToMono = (audioBuffer) => {
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const mixed = new Float32Array(audioBuffer.length);
    for (let index = 0; index < audioBuffer.length; index += 1) {
      mixed[index] = ((left[index] || 0) + (right[index] || 0)) / 2;
    }
    return mixed;
  };

  const convertRecordedBlobToWav = async (blob) => {
    if (!AudioContextCtor) {
      throw new Error('AudioContext is not available in this VS Code environment.');
    }

    const audioContext = new AudioContextCtor();
    try {
      const sourceBytes = await blob.arrayBuffer();
      const decoded = await audioContext.decodeAudioData(sourceBytes.slice(0));
      return encodeWav(decoded);
    } finally {
      if (typeof audioContext.close === 'function') {
        await audioContext.close().catch(() => {});
      }
    }
  };

  const bytesToBase64 = (bytes) => {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
      const chunk = bytes.subarray(index, index + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  };

  const buildSuggestedFileName = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const prefix = initialState.suggestedFileNamePrefix || 'cosyvoice-reference';
    return `${prefix}-${year}${month}${day}-${hours}${minutes}${seconds}.wav`;
  };

  const handleStop = async () => {
    stopTimer();
    const mimeType = mediaRecorder && mediaRecorder.mimeType ? mediaRecorder.mimeType : pickMimeType();
    const rawBlob = new Blob(recordedChunks, mimeType ? { type: mimeType } : undefined);
    recordedChunks = [];
    setStatus('processing', labels.processing);

    try {
      recordedBytes = await convertRecordedBlobToWav(rawBlob);
      const wavBlob = new Blob([recordedBytes], { type: 'audio/wav' });
      cleanupPreview();
      previewUrl = URL.createObjectURL(wavBlob);
      previewAudio.src = previewUrl;
      previewAudio.load();
      setStatus('ready', labels.ready);
    } catch (error) {
      resetRecording();
      vscode.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : labels.microphoneError
      });
    } finally {
      stopStream();
      mediaRecorder = null;
      updateButtons();
    }
  };

  const startRecording = async () => {
    try {
      resetRecording();
      const stream = await ensureStream();
      const mimeType = pickMimeType();
      mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recordedChunks = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunks.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        void handleStop();
      };

      mediaRecorder.start();
      setStatus('recording', labels.recording);
      startTimer();
      updateButtons();
    } catch (error) {
      stopStream();
      vscode.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : labels.microphoneError
      });
      resetRecording();
    }
  };

  const stopRecording = () => {
    if (!mediaRecorder || mediaRecorder.state !== 'recording') {
      return;
    }

    mediaRecorder.stop();
    updateButtons();
  };

  startBtn.addEventListener('click', () => {
    void startRecording();
  });

  stopBtn.addEventListener('click', () => {
    stopRecording();
  });

  retryBtn.addEventListener('click', () => {
    resetRecording();
  });

  saveBtn.addEventListener('click', () => {
    if (!recordedBytes) {
      return;
    }

    vscode.postMessage({
      type: 'save-recording',
      fileName: buildSuggestedFileName(),
      audioBase64: bytesToBase64(recordedBytes)
    });
  });

  closeBtn.addEventListener('click', () => {
    stopTimer();
    stopStream();
    cleanupPreview();
    vscode.postMessage({ type: 'cancel' });
  });

  window.addEventListener('beforeunload', () => {
    stopTimer();
    stopStream();
    cleanupPreview();
  });

  setStatus('idle', labels.idle);
  setDuration(0);
  updateButtons();
}());
