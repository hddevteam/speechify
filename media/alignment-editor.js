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
    const saveBtn = document.getElementById('saveBtn');
    const narratorBtn = document.getElementById('narratorBtn');

    let segments = initialState.segments.map(seg => ({ ...seg }));
    let duration = 0;
    let activeIndex = -1; 
    let selectedIndex = segments.length > 0 ? 0 : -1; 
    let lastSeekTime = 0;
    let seekPending = false;
    let currentAudio = null;
    const audioCache = new Map();

    const formatTime = (value) => {
      const m = Math.floor(value / 60);
      const s = value % 60;
      return `${m}:${s.toFixed(1).padStart(4, '0')}`;
    };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const computeScale = () => {
      const width = timeline.clientWidth || 1;
      return width / Math.max(duration, 1);
    };

    const updatePlayhead = () => {
      const scale = computeScale();
      playhead.style.left = (video.currentTime * scale) + 'px';
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
      const scale = computeScale();
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
              video.currentTime = seg.startTime;
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
              if (now - lastSeekTime > 60) { 
                video.currentTime = seg.startTime;
                lastSeekTime = now;
              } else if (!seekPending) {
                seekPending = true;
                setTimeout(() => {
                  if (activeIndex === index) video.currentTime = seg.startTime;
                  seekPending = false;
                }, 70);
              }
              updatePlayhead();
            }
          };

          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            activeIndex = -1;
            rebuildSegments();
            vscode.postMessage({ type: 'auto-save', segments });
          };

          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });

        segmentEl.addEventListener('click', () => {
          selectedIndex = index;
          video.currentTime = seg.startTime;
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
      const nextSeg = segments[selectedIndex + 1];
      const end = nextSeg ? nextSeg.startTime : duration;
      const segDuration = end - seg.startTime;

      segmentsInfo.innerHTML = `
        <div class="segment-card animate-slide-up">
          <div class="card-header-flex">
            <input type="text" id="titleInput" 
              class="title-input-pro" 
              value="${(seg.title || '').replace(/"/g, '&quot;')}" 
              placeholder="${initialState.labels.segmentTitle}">
            <div class="time-badge-pro">
              <span>${formatTime(segDuration)}</span>
              <button id="playVoiceBtn" class="play-voice-btn" title="${initialState.labels.preview}">
                <svg viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="content-body-pro">
            ${seg.content}
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
          vscode.postMessage({ type: 'auto-save', segments });
      });

      const playVoiceBtn = document.getElementById('playVoiceBtn');
      if (playVoiceBtn) {
        playVoiceBtn.addEventListener('click', () => {
          // Stop any existing playback
          if (currentAudio) {
            currentAudio.pause();
            currentAudio = null;
            document.querySelectorAll('.play-voice-btn.playing').forEach(btn => btn.classList.remove('playing'));
          }

          const text = seg.content;
          
          // Use cached audio if available
          if (audioCache.has(text)) {
            console.log('[Webview] Using cached audio for preview');
            playAudio(audioCache.get(text), playVoiceBtn);
            return;
          }

          console.log('[Webview] Preview button clicked, requesting synthesis');
          playVoiceBtn.classList.add('playing');
          vscode.postMessage({ type: 'preview-voice', text });
        });
      }
    };

    const playAudio = (base64Data, btn) => {
      if (btn) btn.classList.add('playing');
      
      currentAudio = new Audio(`data:audio/mpeg;base64,${base64Data}`);
      currentAudio.onplay = () => console.log('[Webview] Audio started playing');
      currentAudio.onended = () => {
        console.log('[Webview] Audio playback ended');
        if (btn) btn.classList.remove('playing');
        currentAudio = null;
      };
      currentAudio.onerror = (e) => {
        console.error('[Webview] Audio error:', currentAudio.error);
        if (btn) btn.classList.remove('playing');
        currentAudio = null;
      };

      currentAudio.play().catch(err => {
        console.error('[Webview] Audio play promise failed:', err);
        if (btn) btn.classList.remove('playing');
        currentAudio = null;
      });
    };

    video.addEventListener('loadedmetadata', () => {
      duration = video.duration || 0;
      normalizeSegments(segments, duration);
      if (selectedIndex === 0 && segments.length > 0) {
        video.currentTime = segments[0].startTime;
      }
      rebuildSegments();
      updateInfo();
    });

    video.addEventListener('timeupdate', updatePlayhead);
    window.addEventListener('resize', rebuildSegments);

    timeline.addEventListener('click', (event) => {
      if (event.target !== timeline) return;
      const rect = timeline.getBoundingClientRect();
      const scale = computeScale();
      video.currentTime = clamp((event.clientX - rect.left) / scale, 0, duration);
    });

    saveBtn.addEventListener('click', () => {
      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="animate-pulse">Synthesizing...</span>';
      vscode.postMessage({ type: 'save', segments });
    });

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
      }
      
      if (message.type === 'audio-data') {
        const playBtn = document.getElementById('playVoiceBtn');
        console.log('[Webview] Audio data received, length:', message.data.length);

        // Cache the result to avoid redundant API calls
        const seg = segments[selectedIndex];
        if (seg) {
          audioCache.set(seg.content, message.data);
        }

        playAudio(message.data, playBtn);
      }
    });

    (async function preloadVideo() {
      try {
        const response = await fetch(initialState.videoSrc);
        const reader = response.body.getReader();
        const contentLength = +response.headers.get('Content-Length');
        
        let receivedLength = 0;
        let chunks = [];
        while(true) {
          const {done, value} = await reader.read();
          if (done) break;
          chunks.push(value);
          receivedLength += value.length;
          if (contentLength) {
            const percent = Math.round((receivedLength / contentLength) * 100);
            loadingText.textContent = 'Buffering Studio Quality Video: ' + percent + '%';
          }
        }

        const blob = new Blob(chunks, { type: 'video/mp4' });
        video.src = URL.createObjectURL(blob);
        loadingOverlay.classList.add('hide');
        setTimeout(() => loadingOverlay.remove(), 600);
      } catch (err) {
        video.src = initialState.videoSrc;
        loadingOverlay.remove();
      }
    })();
})();
