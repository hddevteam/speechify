import * as path from 'path';
import * as vscode from 'vscode';

export interface CosyVoiceRecordingResult {
  suggestedFileName: string;
  audioBuffer: Uint8Array;
}

interface RecorderLabels {
  title: string;
  subtitle: string;
  idle: string;
  recording: string;
  processing: string;
  ready: string;
  start: string;
  stop: string;
  retry: string;
  save: string;
  close: string;
  preview: string;
  permissionHint: string;
  microphoneError: string;
}

interface RecorderInitState {
  labels: RecorderLabels;
  suggestedFileNamePrefix: string;
}

type RecorderMessage =
  | { type: 'cancel' }
  | { type: 'error'; message?: string }
  | { type: 'save-recording'; fileName?: string; audioBase64?: string };

export class CosyVoiceRecorderPanel {
  public static async record(context: vscode.ExtensionContext): Promise<CosyVoiceRecordingResult | null> {
    const panel = vscode.window.createWebviewPanel(
      'speechifyCosyVoiceRecorder',
      this.getLabels().title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
      }
    );

    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'media', 'cosyvoice-recorder.css'))
    );
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'media', 'cosyvoice-recorder.js'))
    );

    const initState: RecorderInitState = {
      labels: this.getLabels(),
      suggestedFileNamePrefix: 'cosyvoice-reference'
    };

    panel.webview.html = this.getHtml(panel.webview, initState, styleUri, scriptUri);

    return new Promise(resolve => {
      let settled = false;

      const finish = (result: CosyVoiceRecordingResult | null): void => {
        if (settled) {
          return;
        }

        settled = true;
        resolve(result);
        panel.dispose();
      };

      panel.onDidDispose(() => {
        finish(null);
      });

      panel.webview.onDidReceiveMessage((message: RecorderMessage) => {
        if (message.type === 'cancel') {
          finish(null);
          return;
        }

        if (message.type === 'error') {
          vscode.window.showErrorMessage(message.message || this.getLabels().microphoneError);
          return;
        }

        if (message.type !== 'save-recording' || !message.audioBase64) {
          return;
        }

        const fileName = this.normalizeFileName(message.fileName);
        finish({
          suggestedFileName: fileName,
          audioBuffer: Uint8Array.from(Buffer.from(message.audioBase64, 'base64'))
        });
      });
    });
  }

  private static normalizeFileName(input?: string): string {
    const fallback = `${this.createTimestampFileStem()}.wav`;
    if (!input) {
      return fallback;
    }

    const baseName = path.basename(input);
    return baseName.toLowerCase().endsWith('.wav') ? baseName : `${baseName}.wav`;
  }

  private static createTimestampFileStem(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `cosyvoice-reference-${year}${month}${day}-${hours}${minutes}${seconds}`;
  }

  private static getLabels(): RecorderLabels {
    const isChinese = vscode.env.language.toLowerCase().startsWith('zh');
    if (isChinese) {
      return {
        title: '录制 CosyVoice 参考音频',
        subtitle: '在 VS Code 里直接录一小段清晰人声，保存后就能作为本地声音克隆参考。',
        idle: '准备开始录音',
        recording: '正在录音',
        processing: '正在整理音频',
        ready: '录音已就绪',
        start: '开始录音',
        stop: '停止录音',
        retry: '重新录制',
        save: '保存为参考音频',
        close: '关闭',
        preview: '录音预览',
        permissionHint: '首次使用时，macOS 可能会要求给 VS Code 麦克风权限。',
        microphoneError: '录制参考音频失败。请检查麦克风权限后重试。'
      };
    }

    return {
      title: 'Record CosyVoice Reference Audio',
      subtitle: 'Capture a short clean voice sample directly in VS Code and save it as your local cloning reference.',
      idle: 'Ready to record',
      recording: 'Recording',
      processing: 'Processing audio',
      ready: 'Recording ready',
      start: 'Start Recording',
      stop: 'Stop Recording',
      retry: 'Record Again',
      save: 'Save as Reference Audio',
      close: 'Close',
      preview: 'Preview',
      permissionHint: 'On first use, macOS may ask you to grant microphone access to VS Code.',
      microphoneError: 'Failed to record reference audio. Check microphone permission and try again.'
    };
  }

  private static getHtml(
    webview: vscode.Webview,
    initState: RecorderInitState,
    styleUri: vscode.Uri,
    scriptUri: vscode.Uri
  ): string {
    const nonce = this.getNonce();
    const serializedState = JSON.stringify(initState).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; media-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${initState.labels.title}</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div class="shell">
    <div class="hero">
      <div class="eyebrow">Speechify Local Voice</div>
      <h1>${initState.labels.title}</h1>
      <p>${initState.labels.subtitle}</p>
    </div>

    <div class="panel">
      <div class="panel-header">
        <div class="status-stack">
          <div id="statusBadge" class="status-badge idle">${initState.labels.idle}</div>
          <div id="duration" class="duration">00:00</div>
        </div>
        <div class="pulse-wrap">
          <div id="pulse" class="pulse idle"></div>
        </div>
      </div>

      <div class="actions">
        <button id="startBtn" class="btn btn-primary">${initState.labels.start}</button>
        <button id="stopBtn" class="btn btn-danger" disabled>${initState.labels.stop}</button>
        <button id="retryBtn" class="btn btn-secondary" disabled>${initState.labels.retry}</button>
        <button id="saveBtn" class="btn btn-accent" disabled>${initState.labels.save}</button>
      </div>

      <div class="preview-card">
        <div class="preview-label">${initState.labels.preview}</div>
        <audio id="previewAudio" controls preload="none"></audio>
      </div>

      <div class="permission-hint">${initState.labels.permissionHint}</div>
    </div>

    <button id="closeBtn" class="link-btn">${initState.labels.close}</button>
  </div>

  <script nonce="${nonce}">
    window.__INITIAL_STATE__ = ${serializedState};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private static getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let i = 0; i < 32; i++) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return value;
  }
}
