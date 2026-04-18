(function () {
  const vscode = acquireVsCodeApi();

  const titleEl = document.getElementById('title');
  const subtitleEl = document.getElementById('subtitle');
  const targetLabelEl = document.getElementById('targetLabel');
  const targetHintEl = document.getElementById('targetHint');
  const actionLabelEl = document.getElementById('actionLabel');
  const providerLabelEl = document.getElementById('providerLabel');
  const busyLabelEl = document.getElementById('busyLabel');
  const providerCardsEl = document.getElementById('providerCards');

  const targetButtons = Array.from(document.querySelectorAll('[data-target]'));
  const actionButtons = Array.from(document.querySelectorAll('[data-action]'));

  let state = null;
  let busyAction = null;

  const escapeHtml = (value) => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const updateBusyVisualState = (selector, busyKeyResolver) => {
    Array.from(document.querySelectorAll(selector)).forEach(button => {
      const isBusy = busyAction === busyKeyResolver(button);
      button.disabled = Boolean(busyAction);
      button.classList.toggle('is-busy', isBusy);
    });
  };

  const renderFieldControl = (field) => {
    if (field.multiline) {
      return `<textarea class="field-input field-textarea ${field.mono ? 'mono' : ''}" data-field-input="${field.id}" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(field.value || '')}</textarea>`;
    }

    return `<input class="field-input ${field.mono ? 'mono' : ''}" data-field-input="${field.id}" type="text" value="${escapeHtml(field.value || '')}" placeholder="${escapeHtml(field.placeholder || '')}" />`;
  };

  const renderCards = () => {
    if (!state) {
      providerCardsEl.innerHTML = '';
      return;
    }

    providerCardsEl.innerHTML = state.providers.map(provider => `
      <article class="card ${(state.target === provider.id || state.target === 'both') ? 'is-active' : ''}">
        <div class="card-title">${provider.title}</div>
        <div class="field-list">
          ${provider.editableFields.map(field => `
            <form class="field-editor" data-field-id="${field.id}">
              <label class="field-label" for="field-${field.id}">${field.label}</label>
              <div class="field-controls">
                ${renderFieldControl(field).replace(`data-field-input="${field.id}"`, `id="field-${field.id}" data-field-input="${field.id}"`)}
                <button class="field-save-btn" data-field-id="${field.id}" type="submit">${field.submitLabel}</button>
              </div>
            </form>
          `).join('')}
        </div>
      </article>
    `).join('');

    Array.from(document.querySelectorAll('.field-editor')).forEach(form => {
      form.addEventListener('submit', event => {
        event.preventDefault();
        const fieldId = form.dataset.fieldId;
        const input = form.querySelector('[data-field-input]');

        if (!fieldId || !input) {
          return;
        }

        vscode.postMessage({
          type: 'save-field',
          fieldId,
          value: input.value
        });
      });
    });

    updateBusyVisualState('.field-save-btn', button => button.dataset.fieldId);
    Array.from(document.querySelectorAll('.field-input')).forEach(input => {
      input.disabled = Boolean(busyAction);
    });
  };

  const updateTargets = () => {
    if (!state) {
      return;
    }

    targetButtons.forEach(button => {
      const isActive = button.dataset.target === state.target;
      button.classList.toggle('is-active', isActive);
      button.disabled = Boolean(busyAction);
    });
  };

  const updateActions = () => {
    if (!state) {
      return;
    }

    updateBusyVisualState('[data-action]', button => button.dataset.action);

    if (!busyAction) {
      busyLabelEl.textContent = state.labels.statusReady;
      return;
    }

    const actionMap = {
      record: state.labels.workingRecord,
      'select-media': state.labels.workingSelectMedia,
      transcribe: state.labels.workingTranscribe
    };
    busyLabelEl.textContent = actionMap[busyAction] || state.labels.workingSaveField;
  };

  const render = () => {
    if (!state) {
      return;
    }

    titleEl.textContent = state.labels.title;
    subtitleEl.textContent = state.labels.subtitle;
    targetLabelEl.textContent = state.labels.targetLabel;
    targetHintEl.textContent = state.labels.targetHint;
    actionLabelEl.textContent = state.labels.actionLabel;
    providerLabelEl.textContent = state.labels.providerLabel;

    document.getElementById('targetCosy').textContent = state.labels.cosyVoice;
    document.getElementById('targetQwen').textContent = state.labels.qwenTts;
    document.getElementById('targetBoth').textContent = state.labels.both;

    document.getElementById('recordBtn').textContent = state.labels.record;
    document.getElementById('selectBtn').textContent = state.labels.selectMedia;
    document.getElementById('transcribeBtn').textContent = state.labels.transcribe;

    updateTargets();
    updateActions();
    renderCards();
  };

  targetButtons.forEach(button => {
    button.addEventListener('click', () => {
      vscode.postMessage({
        type: 'set-target',
        target: button.dataset.target
      });
    });
  });

  actionButtons.forEach(button => {
    button.addEventListener('click', () => {
      vscode.postMessage({
        type: 'run-action',
        action: button.dataset.action
      });
    });
  });

  window.addEventListener('message', event => {
    const message = event.data || {};

    if (message.type === 'state') {
      state = message.state;
      render();
      return;
    }

    if (message.type === 'busy') {
      busyAction = message.busy ? message.action : null;
      updateTargets();
      updateActions();
      renderCards();
      return;
    }

    if (message.type === 'error') {
      busyAction = null;
      updateTargets();
      updateActions();
      renderCards();
      window.alert(message.message || 'Action failed.');
    }
  });

  vscode.postMessage({ type: 'ready' });
}());
