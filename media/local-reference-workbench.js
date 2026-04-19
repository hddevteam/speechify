(function () {
  const vscode = acquireVsCodeApi();

  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const providerLabelEl = document.getElementById('providerLabel');
  const providerCardsEl = document.getElementById('providerCards');

  let state = null;
  let busyAction = null;

  // Per-provider recording state
  const recorderStates = {};

  const getRecorderState = (providerId) => {
    if (!recorderStates[providerId]) {
      recorderStates[providerId] = { recState: 'idle', hasRecording: false, timerId: null, startedAt: 0 };
    }
    return recorderStates[providerId];
  };

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // --- Timer ---

  const setDuration = (providerId, ms) => {
    const el = document.querySelector(`[data-duration="${providerId}"]`);
    if (!el) { return; }
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    el.textContent = `${minutes}:${seconds}`;
  };

  const startTimer = (providerId) => {
    const rec = getRecorderState(providerId);
    if (rec.timerId) { clearInterval(rec.timerId); }
    rec.startedAt = Date.now();
    setDuration(providerId, 0);
    rec.timerId = setInterval(() => setDuration(providerId, Date.now() - rec.startedAt), 200);
  };

  const stopTimer = (providerId) => {
    const rec = getRecorderState(providerId);
    if (rec.timerId) { clearInterval(rec.timerId); rec.timerId = null; }
  };

  // --- Recorder UI update ---

  const updateRecorderUI = (providerId) => {
    if (!state) { return; }
    const rec = getRecorderState(providerId);
    const labels = state.labels;
    const { recState, hasRecording } = rec;

    const badge = document.querySelector(`[data-status-badge="${providerId}"]`);
    const pulse = document.querySelector(`[data-pulse="${providerId}"]`);
    const durationEl = document.querySelector(`[data-duration="${providerId}"]`);
    const startBtn = document.querySelector(`[data-record="${providerId}"]`);
    const stopBtn = document.querySelector(`[data-stop="${providerId}"]`);
    const retryBtn = document.querySelector(`[data-retry="${providerId}"]`);
    const saveBtn = document.querySelector(`[data-save="${providerId}"]`);
    const previewWrap = document.querySelector(`[data-preview-wrap="${providerId}"]`);

    if (!badge) { return; }

    const isIdle = recState === 'idle';
    const isRecording = recState === 'recording';
    const isProcessing = recState === 'processing';
    const isReady = recState === 'ready' && hasRecording;
    const isBusy = Boolean(busyAction);

    const statusMap = {
      idle: labels.idle,
      recording: labels.recording,
      processing: labels.processing,
      ready: labels.ready
    };
    badge.textContent = statusMap[recState] || labels.idle;
    badge.className = `status-badge ${recState}`;
    if (pulse) { pulse.className = `pulse ${recState}`; }
    if (durationEl) { durationEl.className = `duration ${recState}`; }

    if (startBtn) {
      startBtn.disabled = !isIdle || isBusy;
      startBtn.classList.toggle('is-active', isIdle && !isBusy);
    }
    if (stopBtn) {
      stopBtn.disabled = !isRecording;
      stopBtn.classList.toggle('is-active', isRecording);
    }
    if (retryBtn) { retryBtn.disabled = !isReady || isBusy; }
    if (saveBtn) {
      saveBtn.disabled = !isReady || isBusy;
      saveBtn.classList.toggle('is-active', isReady && !isBusy);
    }
    if (isProcessing) {
      [startBtn, stopBtn, retryBtn, saveBtn].forEach(b => { if (b) { b.disabled = true; } });
    }
    if (previewWrap) { previewWrap.hidden = !isReady && !previewWrap.dataset.existingAudio; }
  };

  const resetRecorder = (providerId) => {
    const rec = getRecorderState(providerId);
    stopTimer(providerId);
    rec.recState = 'idle';
    rec.hasRecording = false;
    setDuration(providerId, 0);
    const preview = document.querySelector(`[data-preview="${providerId}"]`);
    if (preview) {
      const existingAudio = previewWrap?.dataset.existingAudio;
      if (existingAudio) { preview.src = existingAudio; preview.load(); }
      else { preview.removeAttribute('src'); preview.load(); }
    }
    updateRecorderUI(providerId);
  };

  // --- Render ---

  const renderCards = () => {
    if (!state) { providerCardsEl.innerHTML = ''; return; }

    const labels = state.labels;

    providerCardsEl.innerHTML = state.providers.map(provider => `
      <article class="card" data-card="${provider.id}">
        <div class="card-title">
          ${escapeHtml(provider.title)}
          ${provider.repoUrl ? `<a class="card-repo-link" href="${provider.repoUrl}" title="GitHub Repository" target="_blank">GitHub ↗</a>` : ''}
        </div>

        <div class="recorder">
          <div class="recorder-header">
            <div class="recorder-status-left">
              <span class="status-badge idle" data-status-badge="${provider.id}">${escapeHtml(labels.idle)}</span>
              <span class="duration idle" data-duration="${provider.id}">00:00</span>
            </div>
            <div class="pulse-wrap"><div class="pulse idle" data-pulse="${provider.id}"></div></div>
          </div>
          <div class="recorder-actions">
            <button class="btn btn-primary is-active" data-record="${provider.id}">${escapeHtml(labels.record)}</button>
            <button class="btn btn-danger" data-stop="${provider.id}" disabled>${escapeHtml(labels.stopRecording)}</button>
            <button class="btn btn-secondary" data-retry="${provider.id}" disabled>${escapeHtml(labels.retryRecording)}</button>
            <button class="btn btn-accent" data-save="${provider.id}" disabled>${escapeHtml(labels.saveRecording)}</button>
            <button class="btn btn-secondary" data-select="${provider.id}">${escapeHtml(labels.selectMedia)}</button>
            <button class="btn btn-secondary" data-transcribe="${provider.id}">${escapeHtml(labels.transcribe)}</button>
          </div>
          <div class="preview-card" data-preview-wrap="${provider.id}"${provider.promptAudioWebviewUri ? ` data-existing-audio="${provider.promptAudioWebviewUri}"` : ' hidden'}>
            <div class="preview-label">${escapeHtml(labels.preview)}</div>
            <audio controls data-preview="${provider.id}"${provider.promptAudioWebviewUri ? ` src="${provider.promptAudioWebviewUri}"` : ''}></audio>
          </div>
        </div>

        <form class="reference-text-form" data-reference-form="${provider.id}">
          <label class="field-label" for="ref-text-${provider.id}">${escapeHtml(labels.referenceTextLabel)}</label>
          <div class="field-controls">
            <textarea class="field-input field-textarea" id="ref-text-${provider.id}" data-ref-text="${provider.id}" placeholder="${escapeHtml(provider.defaultReferenceText)}">${escapeHtml(provider.promptText)}</textarea>
            <button class="field-save-btn" type="submit">${escapeHtml(labels.referenceTextSave)}</button>
          </div>
        </form>

        ${provider.editableFields.length > 0 ? `<div class="field-list">${provider.editableFields.map(field => `
          <form class="field-editor" data-field-id="${field.id}">
            <label class="field-label" for="field-${field.id}">${escapeHtml(field.label)}</label>
            <div class="field-controls">
              <input class="field-input${field.mono ? ' mono' : ''}" id="field-${field.id}" data-field-input="${field.id}" type="text" value="${escapeHtml(field.value)}" placeholder="${escapeHtml(field.placeholder || '')}" />
              <button class="field-save-btn" data-field-id="${field.id}" type="submit">${escapeHtml(field.submitLabel)}</button>
            </div>
          </form>
        `).join('')}</div>` : ''}

        <div class="audio-path ${provider.promptAudioPath ? '' : 'muted'}">
          ${provider.promptAudioPath
            ? `<code class="audio-path-value">${escapeHtml(provider.promptAudioPath)}</code>`
            : escapeHtml(labels.noAudioConfigured)}
        </div>


      </article>
    `).join('');

    // Bind events
    state.providers.forEach(provider => {
      const pid = provider.id;

      providerCardsEl.querySelector(`[data-record="${pid}"]`)?.addEventListener('click', () => {
        const rec = getRecorderState(pid);
        rec.recState = 'recording';
        rec.hasRecording = false;
        startTimer(pid);
        updateRecorderUI(pid);
        vscode.postMessage({ type: 'start-recording', providerId: pid });
      });

      providerCardsEl.querySelector(`[data-stop="${pid}"]`)?.addEventListener('click', () => {
        const rec = getRecorderState(pid);
        rec.recState = 'processing';
        stopTimer(pid);
        updateRecorderUI(pid);
        vscode.postMessage({ type: 'stop-recording', providerId: pid });
      });

      providerCardsEl.querySelector(`[data-retry="${pid}"]`)?.addEventListener('click', () => {
        resetRecorder(pid);
      });

      providerCardsEl.querySelector(`[data-save="${pid}"]`)?.addEventListener('click', () => {
        const textEl = document.querySelector(`[data-ref-text="${pid}"]`);
        vscode.postMessage({ type: 'save-recording', providerId: pid, referenceText: textEl ? textEl.value : '' });
      });

      providerCardsEl.querySelector(`[data-select="${pid}"]`)?.addEventListener('click', () => {
        vscode.postMessage({ type: 'select-media', providerId: pid });
      });

      providerCardsEl.querySelector(`[data-transcribe="${pid}"]`)?.addEventListener('click', () => {
        vscode.postMessage({ type: 'transcribe', providerId: pid });
      });

      providerCardsEl.querySelector(`[data-reference-form="${pid}"]`)?.addEventListener('submit', e => {
        e.preventDefault();
        const textEl = document.querySelector(`[data-ref-text="${pid}"]`);
        if (textEl) { vscode.postMessage({ type: 'save-reference-text', providerId: pid, text: textEl.value }); }
      });

      providerCardsEl.querySelectorAll('.field-editor').forEach(form => {
        form.addEventListener('submit', e => {
          e.preventDefault();
          const fieldId = form.dataset.fieldId;
          const input = form.querySelector('[data-field-input]');
          if (fieldId && input) { vscode.postMessage({ type: 'save-field', fieldId, value: input.value }); }
        });
      });

      updateRecorderUI(pid);
    });

    updateGlobalBusyState();
  };

  const updateGlobalBusyState = () => {
    const isBusy = Boolean(busyAction);
    document.querySelectorAll('.field-save-btn').forEach(b => { b.disabled = isBusy; });
    document.querySelectorAll('.field-input').forEach(i => { i.disabled = isBusy; });
    document.querySelectorAll('[data-select]').forEach(b => { b.disabled = isBusy; });
    document.querySelectorAll('[data-transcribe]').forEach(b => { b.disabled = isBusy; });
  };

  const render = () => {
    if (!state) { return; }
    titleEl.textContent = state.labels.title;
    subtitleEl.textContent = state.labels.subtitle;
    providerLabelEl.textContent = state.labels.providerLabel;
    renderCards();
  };

  window.addEventListener('message', event => {
    const message = event.data || {};

    if (message.type === 'state') {
      state = message.state;
      render();
      return;
    }

    if (message.type === 'busy') {
      busyAction = message.busy ? message.action : null;
      if (state) {
        updateGlobalBusyState();
        state.providers.forEach(p => updateRecorderUI(p.id));
      }
      return;
    }

    if (message.type === 'error') {
      busyAction = null;
      if (state) {
        updateGlobalBusyState();
        state.providers.forEach(p => updateRecorderUI(p.id));
      }
      window.alert(message.message || 'Action failed.');
      return;
    }

    if (message.type === 'recording-started') {
      const rec = getRecorderState(message.providerId);
      rec.recState = 'recording';
      rec.hasRecording = false;
      updateRecorderUI(message.providerId);
      return;
    }

    if (message.type === 'recording-stopped') {
      const { providerId, audioSrc } = message;
      const rec = getRecorderState(providerId);
      rec.recState = 'ready';
      rec.hasRecording = true;
      stopTimer(providerId);
      const preview = document.querySelector(`[data-preview="${providerId}"]`);
      if (preview) { preview.src = audioSrc; preview.load(); }
      updateRecorderUI(providerId);
      return;
    }

    if (message.type === 'recording-reset') {
      resetRecorder(message.providerId);
      return;
    }

    if (message.type === 'recording-error') {
      const { providerId } = message;
      const rec = getRecorderState(providerId);
      stopTimer(providerId);
      rec.recState = 'idle';
      updateRecorderUI(providerId);
      window.alert(message.message);
    }
  });

  vscode.postMessage({ type: 'ready' });
}());
