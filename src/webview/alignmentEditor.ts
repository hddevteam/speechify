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
  resetToAi: string;
  saveAndRefine: string;
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
        resetToAi: I18n.t('actions.resetToAi'),
        saveAndRefine: I18n.t('actions.saveAndRefine'),
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
            fs.writeFileSync(options.autoSavePath, JSON.stringify(message.segments, null, 2));
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
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-editorWidget-border);
      --accent: #ff6a00;
      --accent-weak: rgba(255, 106, 0, 0.2);
      --segment-bg: rgba(59, 130, 246, 0.2);
      --segment-border: rgba(59, 130, 246, 0.8);
      --segment-selected: rgba(255, 106, 0, 0.4);
      --segment-selected-border: #ff6a00;
      --segment-active: rgba(16, 185, 129, 0.25);
    }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--fg);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .container {
      display: grid;
      grid-template-rows: auto auto 1fr auto;
      height: 100vh;
      gap: 12px;
      padding: 12px;
      box-sizing: border-box;
    }
    .video-area {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.1);
    }
    video {
      width: 100%;
      max-height: 40vh;
      border-radius: 6px;
      background: #000;
    }
    .timeline-area {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      background: rgba(0, 0, 0, 0.05);
    }
    .timeline-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .timeline {
      position: relative;
      height: 80px;
      background: rgba(120, 120, 120, 0.1);
      border-radius: 6px;
      overflow: hidden;
    }
    .playhead {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background: var(--accent);
      z-index: 3;
    }
    .segment {
      position: absolute;
      top: 10px;
      height: 60px;
      border-radius: 6px;
      background: var(--segment-bg);
      border: 1px solid var(--segment-border);
      padding: 4px 6px;
      box-sizing: border-box;
      cursor: grab;
      user-select: none;
      overflow: hidden;
      font-size: 11px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      transition: background 0.2s, border-color 0.2s;
    }
    .segment strong {
      display: block;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .segment .time-label {
      font-size: 10px;
      opacity: 0.8;
      margin-top: auto;
      text-align: center;
      border-top: 1px solid rgba(0,0,0,0.1);
      padding-top: 2px;
    }
    .segment.selected {
      background: var(--segment-selected);
      border-color: var(--segment-selected-border);
      border-width: 2px;
      z-index: 2;
    }
    .segment.active {
      background: var(--segment-active);
    }
    .info-area {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px;
      background: rgba(0, 0, 0, 0.03);
      overflow-y: auto;
    }
    .segments-info {
      font-size: 13px;
      color: var(--fg);
      line-height: 1.5;
    }
    .footer {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    button {
      border: 1px solid var(--border);
      background: rgba(0,0,0,0.1);
      color: var(--fg);
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
    }
    button.primary {
      background: var(--accent);
      color: #fff;
      border: none;
    }
    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .muted {
      opacity: 0.7;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="video-area">
      <video id="video" controls></video>
    </div>
    <div class="timeline-area">
      <div class="timeline-header">
        <strong>${initState.labels.timeline}</strong>
        <span class="muted">${initState.labels.currentTime}: <span id="currentTimeLabel">0.0</span>s</span>
      </div>
      <div id="timeline" class="timeline">
        <div id="playhead" class="playhead"></div>
      </div>
    </div>
    <div class="info-area">
      <div class="segments-info" id="segmentsInfo"></div>
    </div>
    <div class="footer">
      <div>
        <button id="resetBtn">${initState.labels.resetToAi}</button>
        <button id="cancelBtn">${initState.labels.cancel}</button>
      </div>
      <button id="saveBtn" class="primary">${initState.labels.saveAndRefine}</button>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const initialState = ${serializedState};

    const video = document.getElementById('video');
    const timeline = document.getElementById('timeline');
    const playhead = document.getElementById('playhead');
    const currentTimeLabel = document.getElementById('currentTimeLabel');
    const segmentsInfo = document.getElementById('segmentsInfo');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const cancelBtn = document.getElementById('cancelBtn');

    const originalSegments = initialState.segments.map(seg => ({ ...seg }));
    let segments = initialState.segments.map(seg => ({ ...seg }));
    let duration = 0;
    let activeIndex = -1; // Index of segment being dragged
    let selectedIndex = -1; // Index of segment clicked/selected

    const normalizeSegments = (segs, dur) => {
      const minGap = 0.2;
      for (let i = 0; i < segs.length - 1; i++) {
        if (segs[i+1].startTime < segs[i].startTime + minGap) {
          segs[i+1].startTime = Number((segs[i].startTime + minGap).toFixed(1));
        }
      }
      // Ensure doesn't exceed duration
      if (segs.length > 0) {
        const lastIndex = segs.length - 1;
        if (segs[lastIndex].startTime > dur - minGap) {
          // If pushed too far, pull back and chain pull-back
          segs[lastIndex].startTime = Math.max(0, Number((dur - minGap).toFixed(1)));
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
      currentTimeLabel.textContent = formatTime(video.currentTime);
    };

    const rebuildSegments = () => {
      timeline.querySelectorAll('.segment').forEach(el => el.remove());
      const scale = computeScale();

      segments.forEach((seg, index) => {
        const nextSeg = segments[index + 1];
        const start = seg.startTime;
        const end = nextSeg ? nextSeg.startTime : duration;
        const width = Math.max(6, (end - start) * scale);
        const left = start * scale;

        const segmentEl = document.createElement('div');
        segmentEl.className = 'segment';
        if (index === activeIndex) segmentEl.classList.add('active');
        if (index === selectedIndex) segmentEl.classList.add('selected');

        segmentEl.style.left = left + 'px';
        segmentEl.style.width = width + 'px';
        segmentEl.dataset.index = String(index);
        segmentEl.title = (seg.title || '') + '\\n' + (seg.content || ''); // Hover full info

        const titleSpan = document.createElement('strong');
        titleSpan.textContent = seg.title || initialState.labels.segments;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'time-label';
        timeSpan.textContent = formatTime(start) + 's';

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
            const minStart = prevSeg ? prevSeg.startTime + minGap : 0;
            const maxStart = nextSegLocal ? nextSegLocal.startTime - minGap : duration - 0.1;
            const nextStart = clamp(originalStart + deltaSeconds, minStart, maxStart);
            seg.startTime = Number(nextStart.toFixed(1));
            video.currentTime = seg.startTime;
            updatePlayhead();
            rebuildSegments();
            updateInfo();
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
        segmentsInfo.innerHTML = '<div style="margin-bottom: 4px; font-weight: bold; color: var(--accent);">' + (seg.title || '') + ' (' + formatTime(seg.startTime) + 's)</div>' +
          '<div style="line-height: 1.4; color: var(--fg);">' + (seg.content || '') + '</div>';
      } else {
        segmentsInfo.innerHTML = '<div style="opacity: 0.5; text-align: center; padding-top: 8px;">' + initialState.labels.segments + '</div>';
      }
    };

    const updateLayout = () => {
      rebuildSegments();
      updatePlayhead();
    };

    video.addEventListener('loadedmetadata', () => {
      duration = video.duration || 0;
      normalizeSegments(segments, duration);
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

    resetBtn.addEventListener('click', () => {
      segments = originalSegments.map(seg => ({ ...seg }));
      rebuildSegments();
      updateInfo();
    });

    cancelBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    saveBtn.addEventListener('click', () => {
      saveBtn.disabled = true;
      vscode.postMessage({ type: 'save', segments });
    });

    video.src = initialState.videoSrc;
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
