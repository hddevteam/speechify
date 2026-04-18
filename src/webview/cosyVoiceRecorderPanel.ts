import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { LocalAudioRecorderService } from '../services/localAudioRecorderService';

export interface CosyVoiceRecordingResult {
  suggestedFileName: string;
  audioBuffer: Uint8Array;
  referenceText: string;
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
  preview: string;
  scriptLabel: string;
  scriptHint: string;
  scriptUpdated: string;
  permissionHint: string;
  microphoneError: string;
}

interface RecorderInitState {
  labels: RecorderLabels;
  suggestedFileNamePrefix: string;
  hostAppName: string;
  defaultReferenceText: string;
}

type RecorderMessage =
  | { type: 'cancel' }
  | { type: 'start-recording' }
  | { type: 'stop-recording' }
  | { type: 'save-recording'; referenceText?: string }
  | { type: 'reference-text-changed'; referenceText?: string };

type RecorderHostMessage =
  | { type: 'recording-started' }
  | { type: 'recording-stopped'; audioSrc: string }
  | { type: 'recording-reset' }
  | { type: 'recording-error'; message: string };

export class CosyVoiceRecorderPanel {
  public static async record(context: vscode.ExtensionContext): Promise<CosyVoiceRecordingResult | null> {
    const panel = vscode.window.createWebviewPanel(
      'speechifyCosyVoiceRecorder',
      this.getLabels().title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: false,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media')), vscode.Uri.file(os.tmpdir())]
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
      suggestedFileNamePrefix: 'cosyvoice-reference',
      hostAppName: vscode.env.appName || 'VS Code',
      defaultReferenceText: this.getDefaultReferenceText()
    };

    panel.webview.html = this.getHtml(panel.webview, initState, styleUri, scriptUri);

    return new Promise(resolve => {
      let settled = false;
      let tempRecordingPath = '';
      let latestReferenceText = initState.defaultReferenceText;

      const finish = async (result: CosyVoiceRecordingResult | null): Promise<void> => {
        if (settled) {
          return;
        }

        settled = true;
        await LocalAudioRecorderService.cancelRecording();

        if (tempRecordingPath) {
          try {
            await fs.unlink(tempRecordingPath);
          } catch {
            // Ignore temp cleanup failures.
          }
        }

        resolve(result);
        panel.dispose();
      };

      panel.onDidDispose(() => {
        void finish(null);
      });

      panel.webview.onDidReceiveMessage(async (message: RecorderMessage) => {
        if (message.type === 'reference-text-changed') {
          latestReferenceText = (message.referenceText || '').trim() || initState.defaultReferenceText;
          return;
        }

        if (message.type === 'cancel') {
          await finish(null);
          return;
        }

        if (message.type === 'start-recording') {
          try {
            if (tempRecordingPath) {
              try {
                await fs.unlink(tempRecordingPath);
              } catch {
                // Ignore temp cleanup failures.
              }
              tempRecordingPath = '';
            }

            await LocalAudioRecorderService.cancelRecording();
            tempRecordingPath = await LocalAudioRecorderService.startRecording();
            await panel.webview.postMessage({ type: 'recording-started' } satisfies RecorderHostMessage);
          } catch (error) {
            await panel.webview.postMessage({
              type: 'recording-error',
              message: this.normalizeRecorderError(error, initState.hostAppName)
            } satisfies RecorderHostMessage);
          }
          return;
        }

        if (message.type === 'stop-recording') {
          try {
            tempRecordingPath = await LocalAudioRecorderService.stopRecording();
            const audioSrc = panel.webview.asWebviewUri(vscode.Uri.file(tempRecordingPath)).toString();
            await panel.webview.postMessage({
              type: 'recording-stopped',
              audioSrc
            } satisfies RecorderHostMessage);
          } catch (error) {
            await panel.webview.postMessage({
              type: 'recording-error',
              message: this.normalizeRecorderError(error, initState.hostAppName)
            } satisfies RecorderHostMessage);
          }
          return;
        }

        if (message.type !== 'save-recording') {
          return;
        }

        if (!tempRecordingPath) {
          await panel.webview.postMessage({
            type: 'recording-error',
            message: initState.labels.microphoneError
          } satisfies RecorderHostMessage);
          return;
        }

        try {
          const preparedAudioPath = await LocalAudioRecorderService.cleanupRecordingForReference(tempRecordingPath);
          if (preparedAudioPath !== tempRecordingPath) {
            tempRecordingPath = preparedAudioPath;
          }

          const audioBuffer = await fs.readFile(tempRecordingPath);
          const referenceText = (message.referenceText || latestReferenceText || initState.defaultReferenceText).trim();
          await finish({
            suggestedFileName: `${this.createTimestampFileStem()}.wav`,
            audioBuffer: Uint8Array.from(audioBuffer),
            referenceText
          });
        } catch (error) {
          await panel.webview.postMessage({
            type: 'recording-error',
            message: this.normalizeRecorderError(error, initState.hostAppName)
          } satisfies RecorderHostMessage);
        }
      });
    });
  }

  private static normalizeRecorderError(error: unknown, hostAppName: string): string {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();

    if (normalized.includes('operation not permitted') || normalized.includes('permission denied')) {
      return vscode.env.language.toLowerCase().startsWith('zh')
        ? `麦克风权限被 ${hostAppName} 或其录音后端拒绝。请确认“系统设置 -> 隐私与安全性 -> 麦克风”里允许 ${hostAppName}，然后完全退出并重开应用后再试。`
        : `Microphone access was denied for ${hostAppName} or its recording backend. Allow ${hostAppName} in System Settings -> Privacy & Security -> Microphone, then fully restart the app and try again.`;
    }

    if (normalized.includes('input/output error') || normalized.includes('not found')) {
      return vscode.env.language.toLowerCase().startsWith('zh')
        ? '没有拿到可用的麦克风输入设备。请确认系统默认输入设备可用后再试。'
        : 'No usable microphone input device was found. Check that your system default input device is available and try again.';
    }

    return message;
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

  private static getDefaultReferenceText(): string {
    if (vscode.env.language.toLowerCase().startsWith('zh')) {
      return '你好，这是一段参考录音。请用自然、清晰、稳定的语速朗读。';
    }

    return 'Hello. This is a reference recording. Please read it clearly and at a steady pace.';
  }

  private static getLabels(): RecorderLabels {
    const isChinese = vscode.env.language.toLowerCase().startsWith('zh');
    if (isChinese) {
      return {
        title: '录制 CosyVoice 参考音频',
        subtitle: '面板里会显示一段建议朗读文案。你可以直接照着读，录完后这段文字会自动保存为参考文本。',
        idle: '准备开始录音',
        recording: '正在录音',
        processing: '正在整理音频',
        ready: '录音已就绪',
        start: '开始录音',
        stop: '停止录音',
        retry: '重新录制',
        save: '保存为参考音频',
        preview: '录音预览',
        scriptLabel: '参考朗读文案',
        scriptHint: '建议直接朗读这段文字；也可以先改成你想读的内容。',
        scriptUpdated: '参考文案已更新',
        permissionHint: '当前录音走 VS Code 宿主侧原生录音，不再依赖 webview 麦克风权限。',
        microphoneError: '录制参考音频失败。请检查麦克风权限和默认输入设备后重试。'
      };
    }

    return {
      title: 'Record CosyVoice Reference Audio',
      subtitle: 'A suggested script is shown below. Read it directly and the same text will be saved as the reference transcript.',
      idle: 'Ready to record',
      recording: 'Recording',
      processing: 'Processing audio',
      ready: 'Recording ready',
      start: 'Start Recording',
      stop: 'Stop Recording',
      retry: 'Record Again',
      save: 'Save as Reference Audio',
      preview: 'Preview',
      scriptLabel: 'Reference Script',
      scriptHint: 'Read this text as-is, or edit it before you start recording.',
      scriptUpdated: 'Reference script updated',
      permissionHint: 'Recording now uses a host-side native recorder instead of webview microphone APIs.',
      microphoneError: 'Failed to record reference audio. Check microphone permission and the default input device.'
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

      <div class="script-card">
        <div class="script-head">
          <div class="preview-label">${initState.labels.scriptLabel}</div>
          <div id="scriptState" class="script-state">${initState.labels.scriptUpdated}</div>
        </div>
        <textarea id="referenceText" class="script-textarea">${initState.defaultReferenceText}</textarea>
        <div class="script-hint">${initState.labels.scriptHint}</div>
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
