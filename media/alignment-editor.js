(function() {
    const vscode = acquireVsCodeApi();
    const initialState = window.__INITIAL_STATE__;

    const video = document.getElementById('video');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const ruler = document.getElementById('ruler');
    const timeline = document.getElementById('timeline');
    const playhead = document.getElementById('playhead');
    const segmentsInfo = document.getElementById('segmentsInfo');
    const synthesizeBtn = document.getElementById('synthesizeBtn');
    const narratorBtn = document.getElementById('narratorBtn');
    const resizer = document.getElementById('resizer');
    const videoSection = document.getElementById('videoSection');
    const seekOverlay = document.getElementById('seekOverlay');

    let segments = initialState.segments.map(seg => ({
      ...seg,
      adjustedContent: seg.adjustedContent || seg.content
    }));

    let globalAudio = {
      ...(initialState.audio || {}),
      mode: (initialState.audio && initialState.audio.mode) || 'replace'
    };

    // Resizer Logic
    if (resizer) {
      resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startHeight = videoSection.getBoundingClientRect().height;

        const onMouseMove = (moveEvent) => {
          const deltaY = moveEvent.clientY - startY;
          const newHeight = Math.max(100, Math.min(window.innerHeight - 250, startHeight + deltaY));
          videoSection.style.flex = `0 0 ${newHeight}px`;
        };

        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          rebuildSegments();
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });
    }
    let duration = 0;
    let activeIndex = -1; 
    let selectedIndex = segments.length > 0 ? 0 : -1; 
    let lastSeekTime = 0;
    let seekPending = false;
    let currentAudio = null;
    const audioCache = new Map();
    let cachedScale = 1;
    let playheadFramePending = false;
    let autoSaveTimer = null;
    const AUTO_SAVE_DEBOUNCE_MS = 300;
    let pendingSeekTime = null;
    let seekHintTimer = null;
    let seekFallbackTimer = null;

    const formatTime = (value) => {
      const m = Math.floor(value / 60);
      const s = value % 60;
      return `${m}:${s.toFixed(1).padStart(4, '0')}`;
    };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const recomputeScale = () => {
      const width = timeline.clientWidth || 1;
      cachedScale = width / Math.max(duration, 1);
      return cachedScale;
    };

    const computeScale = () => cachedScale;

    const postAutoSave = (immediate = false) => {
      if (immediate) {
        if (autoSaveTimer) {
          clearTimeout(autoSaveTimer);
          autoSaveTimer = null;
        }
        vscode.postMessage({ type: 'auto-save', segments, audio: globalAudio });
        return;
      }

      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        vscode.postMessage({ type: 'auto-save', segments, audio: globalAudio });
      }, AUTO_SAVE_DEBOUNCE_MS);
    };

    const updatePlayhead = () => {
      if (playheadFramePending) return;
      playheadFramePending = true;
      requestAnimationFrame(() => {
        const scale = computeScale();
        playhead.style.transform = `translateX(${video.currentTime * scale}px)`;
        playheadFramePending = false;
      });
    };

    const setSeekingOverlay = (visible) => {
      if (!seekOverlay) return;
      if (visible) seekOverlay.classList.remove('hide');
      else seekOverlay.classList.add('hide');
    };

    const clearSeekState = () => {
      pendingSeekTime = null;
      if (seekHintTimer) {
        clearTimeout(seekHintTimer);
        seekHintTimer = null;
      }
      if (seekFallbackTimer) {
        clearTimeout(seekFallbackTimer);
        seekFallbackTimer = null;
      }
      setSeekingOverlay(false);
    };

    const seekTo = (time, options = {}) => {
      if (!Number.isFinite(time)) return;
      const target = clamp(time, 0, Math.max(duration, 0));
      const tolerance = options.tolerance ?? 0.08;
      if (Math.abs(video.currentTime - target) <= tolerance) {
        updatePlayhead();
        return;
      }

      pendingSeekTime = target;
      if (seekHintTimer) clearTimeout(seekHintTimer);
      seekHintTimer = setTimeout(() => {
        if (pendingSeekTime !== null) setSeekingOverlay(true);
      }, 140);

      if (seekFallbackTimer) clearTimeout(seekFallbackTimer);
      seekFallbackTimer = setTimeout(() => {
        if (pendingSeekTime !== null && Math.abs(video.currentTime - target) > 0.15) {
          video.currentTime = target;
        }
      }, 260);

      const useFast = options.fast !== false && typeof video.fastSeek === 'function';
      if (useFast) {
        try {
          video.fastSeek(target);
        } catch {
          video.currentTime = target;
        }
      } else {
        video.currentTime = target;
      }
      updatePlayhead();
    };

    const normalizeSegments = (segs, dur) => {
      const minGap = 0.1;
      for (let i = 0; i < segs.length - 1; i++) {
        if (segs[i+1].startTime < segs[i].startTime + minGap) {
          segs[i+1].startTime = Number((segs[i].startTime + minGap).toFixed(1));
        }
      }
    };

    const rebuildRuler = () => {
      ruler.innerHTML = '';
      const scale = computeScale();
      segments.forEach((seg, index) => {
        const marker = document.createElement('div');
        marker.className = 'marker';
        if (index === selectedIndex) marker.classList.add('selected');
        marker.style.left = (seg.startTime * scale) + 'px';
        
        const label = document.createElement('div');
        label.className = 'marker-label';
        // Changed from duration to Start Time
        label.textContent = formatTime(seg.startTime);
        marker.appendChild(label);
        
        ruler.appendChild(marker);
      });
    };

    const rebuildSegments = () => {
      timeline.querySelectorAll('.segment').forEach(el => el.remove());
      const scale = recomputeScale();
      rebuildRuler();

      // Update Current Selection Title
      const currentSelection = document.getElementById('currentSelection');
      if (currentSelection && selectedIndex >= 0) {
        currentSelection.textContent = `#${selectedIndex + 1} / ${segments.length}`;
      }

      segments.forEach((seg, index) => {
        const nextSeg = segments[index + 1];
        const start = seg.startTime;
        const end = nextSeg ? nextSeg.startTime : duration;
        const segDuration = end - start;
        const width = Math.max(8, (end - start) * scale);
        const left = start * scale;

        const segmentEl = document.createElement('div');
        segmentEl.className = 'segment';
        const isModified = seg.adjustedContent && seg.adjustedContent !== seg.content;
        if (isModified) segmentEl.classList.add('modified');
        if (index === activeIndex) segmentEl.classList.add('active');
        if (index === selectedIndex) segmentEl.classList.add('selected');

        segmentEl.style.left = left + 'px';
        segmentEl.style.width = width + 'px';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'segment-title-text';
        titleDiv.textContent = seg.title || seg.content.substring(0, 30);

        const timeDiv = document.createElement('div');
        timeDiv.className = 'segment-time';
        timeDiv.textContent = formatTime(segDuration);

        segmentEl.appendChild(titleDiv);
        segmentEl.appendChild(timeDiv);

        segmentEl.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          
          if (selectedIndex !== index) {
              selectedIndex = index;
              seekTo(seg.startTime, { fast: true });
              updatePlayhead();
              rebuildSegments();
              updateInfo();
          }
          activeIndex = index;
          
          const startX = event.clientX;
          const originalStart = seg.startTime;

          const onMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            const deltaSeconds = deltaX / scale;
            const prevSeg = segments[index - 1];
            const nextSegLocal = segments[index + 1];
            const minGap = 0.1;
            const minStart = prevSeg ? prevSeg.startTime + minGap : 0;
            const maxStart = nextSegLocal ? nextSegLocal.startTime - minGap : duration - 0.05;
            const nextStart = clamp(originalStart + deltaSeconds, minStart, maxStart);
            const roundedStart = Number(nextStart.toFixed(1));
            
            if (roundedStart !== seg.startTime) {
              seg.startTime = roundedStart;
              segmentEl.style.left = (seg.startTime * scale) + 'px';
              
              const now = Date.now();
              if (now - lastSeekTime > 90) {
                seekTo(seg.startTime, { fast: true, tolerance: 0.12 });
                lastSeekTime = now;
              } else if (!seekPending) {
                seekPending = true;
                setTimeout(() => {
                  if (activeIndex === index) seekTo(seg.startTime, { fast: true, tolerance: 0.12 });
                  seekPending = false;
                }, 110);
              }
              updatePlayhead();
            }
          };

          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            activeIndex = -1;
            rebuildSegments();
            postAutoSave(true);
          };

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });

        segmentEl.addEventListener('click', () => {
          selectedIndex = index;
          seekTo(seg.startTime, { fast: true });
          updatePlayhead();
          rebuildSegments();
          updateInfo();
        });

        timeline.appendChild(segmentEl);
      });
    };

    const updateInfo = () => {
      if (selectedIndex < 0) return;

      const seg = segments[selectedIndex];
      const isGlobalReplace = globalAudio.mode === 'replace';
      const isSpeedOverflow = seg.strategy === 'speed_overflow';
      const nextSeg = segments[selectedIndex + 1];
      const end = nextSeg ? nextSeg.startTime : duration;
      const reservedDur = end - seg.startTime;
      const cached = audioCache.get(seg.adjustedContent || seg.content);
      const isModified = seg.adjustedContent && seg.adjustedContent !== seg.content;
      const isTooLong = cached && cached.duration > (reservedDur + 0.1); // Adding 100ms grace period

      segmentsInfo.innerHTML = `
        <div class="segment-card animate-slide-up">
          <div class="card-header-flex">
            <input type="text" id="titleInput" 
              class="title-input-pro" 
              value="${(seg.title || '').replace(/"/g, '&quot;')}" 
              placeholder="${initialState.labels.segmentTitle}">
            
            <div class="time-badge-pro">
              <div class="time-item">
                <span class="time-label">${initialState.labels.reserved}</span>
                <span class="time-value">${formatTime(reservedDur)}</span>
              </div>
              ${cached ? `
                <div class="time-divider"></div>
                <div class="time-item">
                  <span class="time-label">${initialState.labels.actual}</span>
                  <span class="time-value ${isTooLong ? 'warning-text pulse-warn' : 'success-text'}">${formatTime(cached.duration)}</span>
                </div>
              ` : ''}
              
              <div class="action-divider"></div>

              <div class="strategy-select-container">
                <span class="strategy-label">${initialState.labels.alignmentStrategy}</span>
                <select id="strategySelect" class="strategy-select">
                  <option value="trim" ${(seg.strategy === 'trim' || !seg.strategy) ? 'selected' : ''}>${initialState.labels.strategyTrim}</option>
                  <option value="speed_total" ${seg.strategy === 'speed_total' ? 'selected' : ''}>${initialState.labels.strategySpeedTotal}</option>
                  <option value="speed_overflow" ${seg.strategy === 'speed_overflow' ? 'selected' : ''}>${initialState.labels.strategySpeedOverflow}</option>
                  <option value="freeze" ${seg.strategy === 'freeze' ? 'selected' : ''}>${initialState.labels.strategyFreeze}</option>
                </select>
                <div id="factorContainer" class="factor-container ${seg.strategy === 'speed_overflow' ? '' : 'hide'}">
                  <span class="strategy-label">x</span>
                  <input type="number" id="factorInput" class="factor-input" value="${seg.speedFactor || 2}" min="2" max="20" step="1">
                </div>
              </div>

              <div class="action-divider"></div>

              ${isGlobalReplace ? `
                <div class="audio-toggle-container">
                  <span class="strategy-label">${initialState.labels.muteOriginalDisabledHint}</span>
                </div>
              ` : !isSpeedOverflow ? `
                <div class="audio-toggle-container">
                  <span class="strategy-label">${initialState.labels.muteOriginalOnlySpeedOverflow}</span>
                </div>
              ` : `
                <div class="audio-toggle-container">
                  <label class="mute-label">
                    <input type="checkbox" id="muteOriginalInput" ${seg.audioOverride?.muteOriginal ? 'checked' : ''}>
                    <span>${initialState.labels.muteOriginalSegment}</span>
                  </label>
                </div>
              `}

              <div class="action-divider"></div>

              <button id="playVoiceBtn" class="play-voice-btn" title="${initialState.labels.preview}">
                <svg viewBox="0 0 24 24" id="playIcon">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
              
              <button id="refineSegBtn" class="btn ${isTooLong ? 'btn-warn' : 'btn-primary'} btn-sm" title="${initialState.labels.refine}">
                ${initialState.labels.refine}
              </button>

              ${isModified ? `
                <button id="restoreSegBtn" class="btn btn-secondary btn-sm" title="${initialState.labels.restore}">
                  <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:none;stroke:currentColor;stroke-width:3;margin-right:2px;vertical-align:middle;">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                    <path d="M3 3v5h5"></path>
                  </svg>
                  ${initialState.labels.restore}
                </button>
              ` : ''}
            </div>
          </div>
          
          <div class="editor-container">
            <textarea id="contentInput" 
              class="content-body-pro-input ${isModified ? 'border-modified' : ''}" 
              placeholder="Enter script content...">${seg.adjustedContent || seg.content}</textarea>
          </div>
        </div>
      `;

      const titleInput = document.getElementById('titleInput');
      titleInput.addEventListener('input', (e) => {
          segments[selectedIndex].title = e.target.value;
          const segmentEls = timeline.querySelectorAll('.segment');
          if (segmentEls[selectedIndex]) {
              segmentEls[selectedIndex].querySelector('.segment-title-text').textContent = e.target.value || segments[selectedIndex].content.substring(0, 30);
          }
          postAutoSave();
      });

      const contentInput = document.getElementById('contentInput');
      contentInput.addEventListener('input', (e) => {
          segments[selectedIndex].adjustedContent = e.target.value;
          postAutoSave();
      });

      const strategySelect = document.getElementById('strategySelect');
      if (strategySelect) {
        strategySelect.addEventListener('change', (e) => {
          const newStrategy = e.target.value;
          segments[selectedIndex].strategy = newStrategy;
          
          const factorContainer = document.getElementById('factorContainer');
          if (factorContainer) {
            if (newStrategy === 'speed_overflow') factorContainer.classList.remove('hide');
            else factorContainer.classList.add('hide');
          }

          postAutoSave();
        });
      }

      const factorInput = document.getElementById('factorInput');
      if (factorInput) {
        factorInput.addEventListener('change', (e) => {
          const parsed = parseInt(e.target.value, 10);
          const safeFactor = Number.isFinite(parsed) ? Math.max(2, Math.min(20, parsed)) : 2;
          e.target.value = String(safeFactor);
          segments[selectedIndex].speedFactor = safeFactor;
          postAutoSave();
        });
      }

      const muteOriginalInput = document.getElementById('muteOriginalInput');
      if (muteOriginalInput) {
        muteOriginalInput.addEventListener('change', (e) => {
          if (!segments[selectedIndex].audioOverride) {
            segments[selectedIndex].audioOverride = {};
          }
          segments[selectedIndex].audioOverride.muteOriginal = e.target.checked;
          postAutoSave();
        });
      }

      const refineSegBtn = document.getElementById('refineSegBtn');
      if (refineSegBtn) {
        refineSegBtn.addEventListener('click', () => {
          const actualDuration = cached ? cached.duration : -1;
          console.log('[Webview] Requesting refinement:', { index: selectedIndex, reservedDur, actualDuration });
          vscode.postMessage({ 
            type: 'refine-segment', 
            index: selectedIndex,
            reservedDuration: reservedDur,
            actualDuration: actualDuration,
            content: segments[selectedIndex].adjustedContent || segments[selectedIndex].content
          });
        });
      }

      const restoreSegBtn = document.getElementById('restoreSegBtn');
      if (restoreSegBtn) {
        restoreSegBtn.addEventListener('click', () => {
          console.log('[Webview] Restoring original content for segment:', selectedIndex);
          segments[selectedIndex].adjustedContent = segments[selectedIndex].content;
          rebuildSegments();
          updateInfo();
          postAutoSave(true);
        });
      }

      const playVoiceBtn = document.getElementById('playVoiceBtn');
      if (playVoiceBtn) {
        playVoiceBtn.addEventListener('click', () => {
          if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
            document.querySelectorAll('.play-voice-btn.playing').forEach(btn => btn.classList.remove('playing'));
          }

          const text = seg.adjustedContent || seg.content;
          if (audioCache.has(text)) {
            playAudio(audioCache.get(text).data, playVoiceBtn);
            return;
          }

          playVoiceBtn.classList.add('synthesizing');
          playVoiceBtn.innerHTML = `
            <svg class="icon-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
              <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke-linecap="round"/>
            </svg>
          `;
          vscode.postMessage({ type: 'preview-voice', text });
        });
      }
    };

    const playAudio = (base64Data, btn) => {
      if (btn) {
        btn.classList.remove('synthesizing');
        btn.classList.add('playing');
        btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
      }
      
      try {
        if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
        }
        currentAudio = new Audio(`data:audio/mpeg;base64,${base64Data}`);
        currentAudio.onended = () => {
          if (btn) btn.classList.remove('playing');
          currentAudio = null;
        };
        currentAudio.play().catch(err => {
          console.error('[Webview] Playback failed/blocked:', err);
          if (btn) btn.classList.remove('playing');
        });
      } catch (err) {
        console.error('[Webview] Audio creation failed:', err);
        if (btn) btn.classList.remove('playing');
      }
    };

    video.addEventListener('loadedmetadata', () => {
      duration = video.duration || 0;
      normalizeSegments(segments, duration);
      recomputeScale();
      if (selectedIndex === 0 && segments.length > 0) {
        seekTo(segments[0].startTime, { fast: true });
      }
      rebuildSegments();
      updateInfo();
    });

    video.addEventListener('seeking', () => {
      if (pendingSeekTime !== null) {
        setSeekingOverlay(true);
      }
    });

    const tryFinishSeek = () => {
      if (pendingSeekTime === null) {
        setSeekingOverlay(false);
        return;
      }
      if (Math.abs(video.currentTime - pendingSeekTime) <= 0.12) {
        clearSeekState();
      }
    };

    video.addEventListener('seeked', () => {
      tryFinishSeek();
    });

    video.addEventListener('timeupdate', tryFinishSeek);

    video.addEventListener('error', () => {
      clearSeekState();
    });

    video.addEventListener('timeupdate', updatePlayhead);
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        resizeTimer = null;
        rebuildSegments();
      }, 120);
    });

    timeline.addEventListener('click', (event) => {
      if (event.target !== timeline) return;
      const rect = timeline.getBoundingClientRect();
      const scale = computeScale();
      seekTo((event.clientX - rect.left) / scale, { fast: true });
    });

    if (synthesizeBtn) {
      synthesizeBtn.addEventListener('click', () => {
        synthesizeBtn.disabled = true;
        synthesizeBtn.innerHTML = `<span class="animate-pulse">${initialState.labels.synthesizing}</span>`;
        vscode.postMessage({ type: 'synthesize-video', segments, audio: globalAudio });
      });
    }

    const globalAudioMode = document.getElementById('globalAudioMode');
    if (globalAudioMode) {
      globalAudioMode.addEventListener('change', (e) => {
        globalAudio.mode = e.target.value;
        updateInfo();
        postAutoSave();
      });
    }

    if (narratorBtn) {
      narratorBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'configure-voice' });
      });
    }

    window.addEventListener('message', event => {
      const message = event.data;
      console.log('[Webview] Received message:', message.type);

      if (message.type === 'update-voice') {
        const nameEl = document.getElementById('narratorName');
        if (nameEl) nameEl.textContent = message.voiceName;
        // Invalidate cache when voice changes
        audioCache.clear();
        updateInfo();
      }

      if (message.type === 'refined-text') {
        const { index, text } = message;
        if (segments[index]) {
          segments[index].adjustedContent = text;
          if (selectedIndex === index) {
            updateInfo();
          }
          postAutoSave();
        }
      }
      
      if (message.type === 'audio-data') {
        const seg = segments[selectedIndex];
        if (seg) {
          const text = seg.adjustedContent || seg.content;
          audioCache.set(text, {
            data: message.data,
            duration: message.duration
          });
          
          // 1. Refresh UI to show duration and update the play button state
          updateInfo(); 
          
          // 2. Use a small timeout to let the DOM settle before starting playback
          setTimeout(() => {
            const playBtn = document.getElementById('playVoiceBtn');
            if (playBtn) {
              console.log('[Webview] Auto-playing newly synthesized audio');
              playAudio(message.data, playBtn);
            }
          }, 80);
        }
      }
    });

    (function initializeVideo() {
      console.log('[Webview] Loading video with direct streaming:', initialState.videoSrc);
      loadingText.textContent = 'Loading video stream...';
      video.src = initialState.videoSrc;

      video.addEventListener('canplay', () => {
        loadingOverlay.classList.add('hide');
        setTimeout(() => loadingOverlay.remove(), 600);
      }, { once: true });

      setTimeout(() => {
        if (loadingOverlay.parentNode) {
          console.warn('[Webview] Load timeout, forcing overlay removal');
          loadingOverlay.classList.add('hide');
          setTimeout(() => loadingOverlay.remove(), 600);
        }
      }, 3000);
    })();
})();
