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
        localResourceRoots: [
          vscode.Uri.file(path.dirname(videoFilePath)),
          vscode.Uri.file(path.join(context.extensionPath, 'media'))
        ]
      }
    );

    const videoUri = panel.webview.asWebviewUri(vscode.Uri.file(videoFilePath)).toString();
    const styleUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'alignment-editor.css')));
    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.file(path.join(context.extensionPath, 'media', 'alignment-editor.js')));

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
        refine: I18n.t('actions.refine')
      }
    };

    panel.webview.html = this.getHtml(panel.webview, initState, styleUri, scriptUri);

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

  private static getHtml(
    webview: vscode.Webview, 
    initState: AlignmentEditorInitState, 
    styleUri: vscode.Uri, 
    scriptUri: vscode.Uri
  ): string {
    const nonce = AlignmentEditor.getNonce();
    const serializedState = JSON.stringify(initState).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} blob:; media-src ${webview.cspSource} blob:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${initState.labels.title}</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div id="loadingOverlay" class="loading-overlay">
    <div class="spinner"></div>
    <div id="loadingText" class="loading-text-pulse">Loading Video Studio...</div>
  </div>

  <div class="app-container">
    <!-- Video Area -->
    <div class="video-section">
      <video id="video" controls preload="auto" class="video-shadow"></video>
    </div>

    <!-- Controls & Info Area (Merged) -->
    <div class="controls-section">
      <!-- Dynamic Header with Buttons -->
      <div class="timeline-header">
        <div class="flex items-center gap-3">
          <span class="section-title">${initState.labels.timeline}</span>
          <span id="currentSelection" class="selection-badge"></span>
        </div>
        <div class="footer-actions">
           <button id="saveBtn" class="btn btn-primary">${initState.labels.refine}</button>
        </div>
      </div>

      <div class="timeline-container">
        <div id="ruler" class="ruler"></div>
        <div id="timeline" class="timeline-track">
          <div id="playhead" class="playhead"></div>
        </div>
      </div>

      <!-- Edit Area -->
      <div id="segmentsInfo" class="info-section"></div>
    </div>
  </div>

  <script nonce="${nonce}">
    window.__INITIAL_STATE__ = ${serializedState};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
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
