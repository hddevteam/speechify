import * as vscode from 'vscode';
import * as path from 'path';
import { TimingSegment } from '../utils/videoAnalyzer';
import { I18n } from '../i18n';

interface AlignmentEditorLabels {
  title: string;
  timeline: string;
  segments: string;
  startTime: string;
  currentTime: string;
  setToCurrent: string;
  segmentTitle: string;
  refine: string;
  cancel: string;
}

interface AlignmentEditorInitState {
  videoSrc: string;
  segments: TimingSegment[];
  labels: AlignmentEditorLabels;
}

export class AlignmentEditor {
  public static async open(
    context: vscode.ExtensionContext,
    videoFilePath: string,
    segments: TimingSegment[],
    options?: { autoSavePath?: string }
  ): Promise<TimingSegment[] | null> {
    const panel = vscode.window.createWebviewPanel(
      'speechifyAlignmentEditor',
      I18n.t('alignment.editorTitle'),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.dirname(videoFilePath))]
      }
    );

    const videoUri = panel.webview.asWebviewUri(vscode.Uri.file(videoFilePath)).toString();
    const initState: AlignmentEditorInitState = {
      videoSrc: videoUri,
      segments,
      labels: {
        title: I18n.t('alignment.editorTitle'),
        timeline: I18n.t('alignment.timeline'),
        segments: I18n.t('alignment.segments'),
        startTime: I18n.t('alignment.startTime'),
        currentTime: I18n.t('alignment.currentTime'),
        setToCurrent: I18n.t('alignment.setToCurrent'),
        segmentTitle: I18n.t('alignment.segmentTitle') || 'Title',
        refine: I18n.t('actions.refine'),
        cancel: I18n.t('actions.cancel')
      }
    };

    panel.webview.html = this.getHtml(panel.webview, initState);

    return new Promise((resolve) => {
      let resolved = false;

      const finalize = (value: TimingSegment[] | null): void => {
        if (resolved) return;
        resolved = true;
        resolve(value);
        panel.dispose();
      };

      const disposeListener = panel.onDidDispose(() => {
        if (!resolved) {
          resolve(null);
        }
      });

      panel.webview.onDidReceiveMessage((message) => {
        if (message?.type === 'save' && Array.isArray(message.segments)) {
          finalize(message.segments as TimingSegment[]);
        }

        if (message?.type === 'auto-save' && Array.isArray(message.segments) && options?.autoSavePath) {
          try {
            const fs = require('fs');
            const content = fs.readFileSync(options.autoSavePath, 'utf-8');
            const currentData = JSON.parse(content);
            if (currentData && !Array.isArray(currentData) && 'segments' in currentData) {
                currentData.segments = message.segments;
                currentData.lastModified = new Date().toISOString();
                fs.writeFileSync(options.autoSavePath, JSON.stringify(currentData, null, 2));
            } else {
                fs.writeFileSync(options.autoSavePath, JSON.stringify(message.segments, null, 2));
            }
            console.log(`[AutoSave] Saved segments to ${options.autoSavePath}`);
          } catch (err) {
            console.error('[AutoSave] Failed to save:', err);
          }
        }

        if (message?.type === 'cancel') {
          finalize(null);
        }
      });

      context.subscriptions.push(panel, disposeListener);
    });
  }

  private static getHtml(webview: vscode.Webview, initState: AlignmentEditorInitState): string {
    const nonce = AlignmentEditor.getNonce();
    const serializedState = JSON.stringify(initState).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; media-src ${webview.cspSource} blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${initState.labels.title}</title>
  <style>
    :root {
      color-scheme: light dark;
      --bg: var(--vscode-sideBar-background, #1e1e1e);
      --fg: var(--vscode-sideBar-foreground, #cccccc);
      --border: var(--vscode-editorWidget-border, #444);
      --accent: #ff6a00;
      --accent-hover: #ff8533;
      --accent-weak: rgba(255, 106, 0, 0.2);
      --segment-bg: rgba(59, 130, 246, 0.8);
      --segment-border: rgba(59, 130, 246, 1);
      --segment-selected: rgba(255, 106, 0, 0.85);
      --segment-selected-border: #fff;
      --segment-active: rgba(16, 185, 129, 0.8);
      --segment-text: #ffffff;
      --panel-bg: var(--vscode-editor-background);
      --card-bg: var(--vscode-editor-background);
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      overflow: hidden;
    }
    .loading-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: var(--bg);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      gap: 16px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--accent-weak);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .container {
      display: grid;
      grid-template-rows: 58vh 1fr auto;
      height: 100vh;
      gap: 0;
      padding: 0;
      box-sizing: border-box;
      overflow: hidden;
    }
    .video-area {
      background: #000;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      position: relative;
      border-bottom: 2px solid var(--border);
    }
    video {
      width: 100%;
      height: 100%;
      object-fit: contain;
      max-height: 100%;
    }
    .main-controls {
      display: grid;
      grid-template-rows: auto 1fr;
      gap: 0;
      background: var(--bg);
      overflow: hidden;
    }
    .timeline-area {
      padding: 16px 20px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .ruler {
      position: relative;
      height: 28px;
      margin: 0 10px;
      border-bottom: 1px solid var(--border);
      background-image: linear-gradient(to right, var(--border) 1px, transparent 1px);
      background-size: 20px 8px;
      background-repeat: repeat-x;
      background-position: bottom;
    }
    .marker {
      position: absolute;
      bottom: -1px;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 8px solid var(--fg);
      z-index: 4;
      opacity: 0.4;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .marker.selected {
      border-top-color: var(--accent);
      opacity: 1;
      z-index: 5;
      transform: translateX(-50%) scale(1.2);
    }
    .marker-label {
      position: absolute;
      top: -22px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 10px;
      background: var(--accent);
      color: white;
      padding: 2px 6px;
      border-radius: 4px;
      white-space: nowrap;
      display: none;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      font-weight: bold;
    }
    .marker.selected .marker-label {
      display: block;
    }
    .timeline {
      position: relative;
      height: 84px;
      background: rgba(0, 0, 0, 0.2);
      border-radius: 8px;
      margin: 0 10px;
      border: 1px solid var(--border);
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);
    }
    .playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--accent);
      z-index: 10;
      pointer-events: none;
      box-shadow: 0 0 8px var(--accent);
    }
    .playhead::after {
      content: '';
      position: absolute;
      top: -4px;
      left: -4px;
      width: 10px;
      height: 10px;
      background: var(--accent);
      border-radius: 50%;
    }
    .segment {
      position: absolute;
      top: 8px;
      height: 68px;
      border-radius: 6px;
      background: var(--segment-bg);
      border: 1px solid var(--segment-border);
      padding: 8px 10px;
      box-sizing: border-box;
      cursor: grab;
      user-select: none;
      overflow: hidden;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      transition: all 0.2s ease;
      backdrop-filter: blur(4px);
      color: var(--segment-text);
    }
    .segment:hover {
      filter: brightness(1.2);
      border-color: rgba(255,255,255,0.4);
    }
    .segment strong {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 12px;
      font-weight: 600;
      color: var(--segment-text);
    }
    .segment .time-label {
      font-size: 10px;
      opacity: 0.9;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      margin-top: auto;
      color: var(--segment-text);
    }
    .segment.selected {
      background: var(--segment-selected);
      border-color: var(--segment-selected-border);
      border-width: 2px;
      z-index: 2;
      box-shadow: 0 0 12px rgba(255, 106, 0, 0.4);
    }
    .segment.active {
      background: var(--segment-active);
      cursor: grabbing;
    }
    .info-area {
      padding: 16px 24px;
      background: var(--panel-bg);
      overflow-y: auto;
    }
    .segments-info {
      max-width: 800px;
      margin: 0 auto;
    }
    .segment-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    .segment-title {
      font-size: 16px;
      font-weight: 700;
      color: var(--accent);
      margin-bottom: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .title-input {
      background: var(--bg);
      color: var(--fg);
      border: 1px solid var(--border);
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 14px;
      font-weight: 600;
      flex-grow: 1;
    }
    .title-input:focus {
      outline: none;
      border-color: var(--accent);
    }
    .segment-time-badge {
      font-size: 11px;
      background: var(--accent-weak);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 100px;
      font-family: 'SF Mono', monospace;
    }
    .segment-content {
      font-size: 15px;
      line-height: 1.6;
      color: var(--vscode-editor-foreground, #333);
      white-space: pre-wrap;
      font-weight: 500;
    }
    .footer {
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--bg);
      border-top: 1px solid var(--border);
    }
    .footer-actions {
      display: flex;
      gap: 12px;
    }
    button {
      border: 1px solid var(--border);
      background: transparent;
      color: var(--fg);
      padding: 8px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s;
    }
    button:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.3);
    }
    button.primary {
      background: var(--accent);
      color: #fff;
      border: none;
      padding: 8px 28px;
      font-weight: 600;
      box-shadow: 0 2px 8px rgba(255, 106, 0, 0.3);
    }
    button.primary:hover:not(:disabled) {
      background: var(--accent-hover);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(255, 106, 0, 0.4);
    }
    button.primary:active:not(:disabled) {
      transform: translateY(0);
    }
    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }
    .muted {
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <div id="loadingOverlay" class="loading-overlay">
    <div class="spinner"></div>
    <div id="loadingText">Loading video into memory for instant seeking...</div>
  </div>
  <div class="container">
    <div class="video-area">
      <video id="video" controls preload="auto"></video>
    </div>
    <div class="main-controls">
      <div class="timeline-area">
        <div id="ruler" class="ruler"></div>
        <div id="timeline" class="timeline">
          <div id="playhead" class="playhead"></div>
        </div>
      </div>
      <div class="info-area">
        <div class="segments-info" id="segmentsInfo"></div>
      </div>
    </div>
    <div class="footer">
      <div>
        <button id="cancelBtn">${initState.labels.cancel}</button>
      </div>
      <div class="footer-actions">
        <button id="saveBtn" class="primary">${initState.labels.refine}</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initialState = ${serializedState};

    const video = document.getElementById('video');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingText = document.getElementById('loadingText');
    const ruler = document.getElementById('ruler');
    const timeline = document.getElementById('timeline');
    const playhead = document.getElementById('playhead');
    const segmentsInfo = document.getElementById('segmentsInfo');
    const saveBtn = document.getElementById('saveBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    const originalSegments = initialState.segments.map(seg => ({ ...seg }));
    let segments = initialState.segments.map(seg => ({ ...seg }));
    let duration = 0;
    let activeIndex = -1; // Index of segment being dragged
    let selectedIndex = segments.length > 0 ? 0 : -1; // Default select first segment
    let lastSeekTime = 0;
    let seekPending = false;

    const formatMMSS = (seconds) => {
      const m = Math.floor(seconds / 60);
      const s = Math.floor(seconds % 60);
      return m + ':' + s.toString().padStart(2, '0');
    };

    const normalizeSegments = (segs, dur) => {
      const minGap = 0.05;
      for (let i = 0; i < segs.length - 1; i++) {
        if (segs[i+1].startTime < segs[i].startTime + minGap) {
          segs[i+1].startTime = Number((segs[i].startTime + minGap).toFixed(1));
        }
      }
      // Ensure doesn't exceed duration
      if (segs.length > 0) {
        const lastIndex = segs.length - 1;
        if (segs[lastIndex].startTime > dur - 0.01) {
          segs[lastIndex].startTime = Math.max(0, Number((dur - 0.05).toFixed(1)));
          for (let i = lastIndex - 1; i >= 0; i--) {
            if (segs[i].startTime > segs[i+1].startTime - minGap) {
              segs[i].startTime = Math.max(0, Number((segs[i+1].startTime - minGap).toFixed(1)));
            }
          }
        }
      }
    };

    const formatTime = (value) => value.toFixed(1);

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    const computeScale = () => {
      const width = timeline.clientWidth || 1;
      return width / Math.max(duration, 1);
    };

    const updatePlayhead = () => {
      const scale = computeScale();
      playhead.style.left = (video.currentTime * scale) + 'px';
    };

    const rebuildRuler = () => {
      ruler.innerHTML = '';
      const scale = computeScale();
      segments.forEach((seg, index) => {
        const nextSeg = segments[index + 1];
        const end = nextSeg ? nextSeg.startTime : duration;
        const segDuration = end - seg.startTime;

        const marker = document.createElement('div');
        marker.className = 'marker';
        if (index === selectedIndex) marker.classList.add('selected');
        marker.style.left = (seg.startTime * scale) + 'px';
        
        const label = document.createElement('div');
        label.className = 'marker-label';
        label.textContent = formatTime(segDuration) + 's';
        marker.appendChild(label);
        
        ruler.appendChild(marker);
      });
    };

    const rebuildSegments = () => {
      timeline.querySelectorAll('.segment').forEach(el => el.remove());
      const scale = computeScale();
      rebuildRuler();

      segments.forEach((seg, index) => {
        const nextSeg = segments[index + 1];
        const start = seg.startTime;
        const end = nextSeg ? nextSeg.startTime : duration;
        const segDuration = end - start;
        const width = Math.max(6, (end - start) * scale);
        const left = start * scale;

        const segmentEl = document.createElement('div');
        segmentEl.className = 'segment';
        if (index === activeIndex) segmentEl.classList.add('active');
        if (index === selectedIndex) segmentEl.classList.add('selected');

        segmentEl.style.left = left + 'px';
        segmentEl.style.width = width + 'px';
        segmentEl.dataset.index = String(index);

        const titleSpan = document.createElement('strong');
        titleSpan.textContent = seg.title || seg.content || initialState.labels.segments;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'time-label';
        timeSpan.textContent = formatTime(segDuration) + 's';

        segmentEl.appendChild(titleSpan);
        segmentEl.appendChild(timeSpan);

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
          const minGap = 0.1;

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
              
              // 1. Optimized UI update: update only affected elements' styles
              const left = (seg.startTime * scale);
              segmentEl.style.left = left + 'px';
              
              // Update marker position directly if found
              const markers = ruler.querySelectorAll('.marker');
              if (markers[index]) {
                markers[index].style.left = left + 'px';
              }

              // 2. Throttled Video Seek (max ~15fps during drag to avoid lag)
              const now = Date.now();
              if (now - lastSeekTime > 66) { // ~15fps
                video.currentTime = seg.startTime;
                lastSeekTime = now;
              } else if (!seekPending) {
                seekPending = true;
                setTimeout(() => {
                  if (activeIndex === index) { // Still dragging the same one
                    video.currentTime = seg.startTime;
                  }
                  lastSeekTime = Date.now();
                  seekPending = false;
                }, 70);
              }

              updatePlayhead();
              updateInfo();
            }
          };

          const onUp = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            activeIndex = -1;
            rebuildSegments();
            // Trigger auto-save to file
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
      if (selectedIndex >= 0 && selectedIndex < segments.length) {
        const seg = segments[selectedIndex];
        const nextSeg = segments[selectedIndex + 1];
        const end = nextSeg ? nextSeg.startTime : duration;
        const segDuration = end - seg.startTime;

        segmentsInfo.innerHTML = 
          '<div class="segment-card">' +
            '<div class="segment-title">' +
              '<input type="text" class="title-input" value="' + (seg.title || "").replace(/"/g, '&quot;') + '" placeholder="' + initialState.labels.segmentTitle.replace(/"/g, '&quot;') + '" id="titleInput">' +
              '<span class="segment-time-badge">' + formatTime(segDuration) + 's</span>' +
            '</div>' +
            '<div class="segment-content">' + (seg.content || "") + '</div>' +
          '</div>';

        const titleInput = document.getElementById('titleInput');
        if (titleInput) {
            titleInput.addEventListener('input', (e) => {
                segments[selectedIndex].title = e.target.value;
                // Update visual segment strong tag
                const activeSegEl = timeline.querySelector('.segment.selected strong');
                if (activeSegEl) {
                    activeSegEl.textContent = e.target.value || segments[selectedIndex].content;
                }
                // Auto save
                vscode.postMessage({ type: 'auto-save', segments });
            });
        }
      } else {
        segmentsInfo.innerHTML = '<div style="opacity: 0.5; text-align: center; padding: 40px;">' + initialState.labels.segments + '</div>';
      }
    };

    const updateLayout = () => {
      rebuildSegments();
      updatePlayhead();
    };

    video.addEventListener('loadedmetadata', () => {
      duration = video.duration || 0;
      normalizeSegments(segments, duration);
      if (selectedIndex === 0 && segments.length > 0) {
        video.currentTime = segments[0].startTime;
      }
      updateLayout();
      updateInfo();
    });

    video.addEventListener('timeupdate', updatePlayhead);

    window.addEventListener('resize', updateLayout);

    timeline.addEventListener('click', (event) => {
      if (event.target !== timeline) return;
      const rect = timeline.getBoundingClientRect();
      const scale = computeScale();
      const x = event.clientX - rect.left;
      video.currentTime = clamp(x / scale, 0, duration);
      updatePlayhead();
    });

    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    saveBtn.addEventListener('click', () => {
      saveBtn.disabled = true;
      vscode.postMessage({ type: 'save', segments });
    });

    // Instant Seeking Optimization: Load video as Blob to force into memory
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
            loadingText.textContent = 'Loading video: ' + percent + '%';
          }
        }

        const blob = new Blob(chunks, { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);
        video.src = blobUrl;
        
        loadingOverlay.style.opacity = '0';
        setTimeout(() => loadingOverlay.remove(), 300);
      } catch (err) {
        console.error('Preload failed, falling back to direct stream:', err);
        video.src = initialState.videoSrc;
        loadingOverlay.remove();
      }
    })();
  </script>
</body>
</html>`;
  }

  private static getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
