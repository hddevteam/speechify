(function () {
  const vscode = acquireVsCodeApi();
  const initialState = window.__INITIAL_STATE__ || {};
  const labels = initialState.labels || {};

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const retryBtn = document.getElementById('retryBtn');
  const saveBtn = document.getElementById('saveBtn');
  const statusBadge = document.getElementById('statusBadge');
  const durationEl = document.getElementById('duration');
  const previewAudio = document.getElementById('previewAudio');
  const pulse = document.getElementById('pulse');
  const referenceText = document.getElementById('referenceText');
  const scriptState = document.getElementById('scriptState');

  let timerId = null;
  let recordingStartedAt = 0;
  let hasRecording = false;
  let recorderState = 'idle';

  const setStatus = (kind, text) => {
    statusBadge.textContent = text;
    statusBadge.className = `status-badge ${kind}`;
    pulse.className = `pulse ${kind}`;
    durationEl.className = `duration ${kind}`;
  };

  const setDuration = (ms) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    durationEl.textContent = `${minutes}:${seconds}`;
  };

  const syncButtonVisualState = (button, enabled, active) => {
    button.disabled = !enabled;
    button.classList.toggle('is-active', active);
    button.classList.toggle('is-enabled', enabled);
  };

  const updateButtons = () => {
    const isIdle = recorderState === 'idle';
    const isRecording = recorderState === 'recording';
    const isProcessing = recorderState === 'processing';
    const isReady = recorderState === 'ready' && hasRecording;

    syncButtonVisualState(startBtn, isIdle, isIdle);
    syncButtonVisualState(stopBtn, isRecording, isRecording);
    syncButtonVisualState(retryBtn, isReady, false);
    syncButtonVisualState(saveBtn, isReady, isReady);

    if (isProcessing) {
      syncButtonVisualState(startBtn, false, false);
      syncButtonVisualState(stopBtn, false, false);
      syncButtonVisualState(retryBtn, false, false);
      syncButtonVisualState(saveBtn, false, false);
    }
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

  const resetPreview = () => {
    previewAudio.removeAttribute('src');
    previewAudio.load();
    hasRecording = false;
    setDuration(0);
  };

  const sendReferenceText = () => {
    vscode.postMessage({
      type: 'reference-text-changed',
      referenceText: referenceText.value
    });
  };

  startBtn.addEventListener('click', () => {
    resetPreview();
    recorderState = 'recording';
    setStatus('recording', labels.recording);
    startTimer();
    updateButtons();
    sendReferenceText();
    vscode.postMessage({ type: 'start-recording' });
  });

  stopBtn.addEventListener('click', () => {
    recorderState = 'processing';
    setStatus('processing', labels.processing);
    stopTimer();
    updateButtons();
    vscode.postMessage({ type: 'stop-recording' });
  });

  retryBtn.addEventListener('click', () => {
    resetPreview();
    recorderState = 'idle';
    setStatus('idle', labels.idle);
    updateButtons();
  });

  saveBtn.addEventListener('click', () => {
    vscode.postMessage({
      type: 'save-recording',
      referenceText: referenceText.value
    });
  });

  referenceText.addEventListener('input', () => {
    scriptState.classList.add('dirty');
    sendReferenceText();
  });

  window.addEventListener('message', event => {
    const message = event.data || {};

    if (message.type === 'recording-started') {
      recorderState = 'recording';
      hasRecording = false;
      setStatus('recording', labels.recording);
      updateButtons();
      return;
    }

    if (message.type === 'recording-stopped') {
      recorderState = 'ready';
      hasRecording = true;
      previewAudio.src = message.audioSrc;
      previewAudio.load();
      setStatus('ready', labels.ready);
      updateButtons();
      return;
    }

    if (message.type === 'recording-reset') {
      recorderState = 'idle';
      resetPreview();
      setStatus('idle', labels.idle);
      updateButtons();
      return;
    }

    if (message.type === 'recording-error') {
      recorderState = 'idle';
      stopTimer();
      setStatus('idle', labels.idle);
      updateButtons();
      setTimeout(() => {
        window.alert(message.message || labels.microphoneError);
      }, 0);
    }
  });

  setStatus('idle', labels.idle);
  setDuration(0);
  recorderState = 'idle';
  updateButtons();
}());
