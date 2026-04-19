import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { LocalAudioRecorderService } from '../services/localAudioRecorderService';

export type LocalReferenceWorkbenchFieldId =
  | 'cosyvoice-base-url'
  | 'qwen-python-path'
  | 'qwen-model';

export interface LocalReferenceWorkbenchEditableField {
  id: LocalReferenceWorkbenchFieldId;
  label: string;
  value: string;
  placeholder?: string;
  submitLabel: string;
  mono?: boolean;
}

export interface LocalReferenceWorkbenchProviderState {
  id: 'cosyvoice' | 'qwen3-tts';
  title: string;
  repoUrl: string;
  promptAudioPath: string;
  promptAudioWebviewUri?: string;
  promptText: string;
  defaultReferenceText: string;
  editableFields: LocalReferenceWorkbenchEditableField[];
}

export interface LocalReferenceWorkbenchLabels {
  title: string;
  subtitle: string;
  providerLabel: string;
  record: string;
  stopRecording: string;
  retryRecording: string;
  saveRecording: string;
  selectMedia: string;
  transcribe: string;
  idle: string;
  recording: string;
  processing: string;
  ready: string;
  preview: string;
  referenceTextLabel: string;
  referenceTextSave: string;
  noAudioConfigured: string;
  microphoneError: string;
}

export interface LocalReferenceWorkbenchState {
  labels: LocalReferenceWorkbenchLabels;
  providers: LocalReferenceWorkbenchProviderState[];
}

type WorkbenchMessage =
  | { type: 'ready' }
  | { type: 'start-recording'; providerId: string }
  | { type: 'stop-recording'; providerId: string }
  | { type: 'save-recording'; providerId: string; referenceText: string }
  | { type: 'select-media'; providerId: string }
  | { type: 'transcribe'; providerId: string }
  | { type: 'save-reference-text'; providerId: string; text: string }
  | { type: 'save-field'; fieldId: LocalReferenceWorkbenchFieldId; value: string };

type WorkbenchHostMessage =
  | { type: 'state'; state: LocalReferenceWorkbenchState }
  | { type: 'busy'; action: string | null; busy: boolean }
  | { type: 'error'; message: string }
  | { type: 'recording-started'; providerId: string }
  | { type: 'recording-stopped'; providerId: string; audioSrc: string }
  | { type: 'recording-reset'; providerId: string }
  | { type: 'recording-error'; providerId: string; message: string };

interface LocalReferenceWorkbenchHandlers {
  getState: () => Promise<LocalReferenceWorkbenchState>;
  selectMedia: (providerId: 'cosyvoice' | 'qwen3-tts') => Promise<void>;
  transcribe: (providerId: 'cosyvoice' | 'qwen3-tts') => Promise<void>;
  saveRecording: (providerId: 'cosyvoice' | 'qwen3-tts', audioBuffer: Uint8Array, referenceText: string) => Promise<void>;
  saveReferenceText: (providerId: 'cosyvoice' | 'qwen3-tts', text: string) => Promise<void>;
  saveField: (fieldId: LocalReferenceWorkbenchFieldId, value: string) => Promise<void>;
}

export class LocalReferenceWorkbenchPanel {
  private static currentPanel: LocalReferenceWorkbenchPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private tempRecordingPaths: Record<string, string> = {};

  public static async open(
    context: vscode.ExtensionContext,
    handlers: LocalReferenceWorkbenchHandlers
  ): Promise<void> {
    if (this.currentPanel) {
      this.currentPanel.handlersRef = handlers;
      this.currentPanel.panel.reveal(vscode.ViewColumn.Active);
      await this.currentPanel.refresh();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'speechifyLocalReferenceWorkbench',
      vscode.env.language.toLowerCase().startsWith('zh') ? '配置本地模型' : 'Configure Local Models',
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'media')),
          vscode.Uri.file(os.tmpdir()),
          vscode.Uri.file(os.homedir()),
          ...(vscode.workspace.workspaceFolders?.map(f => f.uri) ?? [])
        ]
      }
    );

    this.currentPanel = new LocalReferenceWorkbenchPanel(panel, context, handlers);
    await this.currentPanel.refresh();
  }

  private handlersRef: LocalReferenceWorkbenchHandlers;

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    handlers: LocalReferenceWorkbenchHandlers
  ) {
    this.panel = panel;
    this.handlersRef = handlers;

    const styleUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'media', 'local-reference-workbench.css'))
    );
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.file(path.join(context.extensionPath, 'media', 'local-reference-workbench.js'))
    );

    panel.webview.html = this.getHtml(panel.webview, styleUri, scriptUri);

    this.disposables.push(
      panel.onDidDispose(async () => {
        LocalReferenceWorkbenchPanel.currentPanel = undefined;
        await this.cancelAllRecordings();
        this.dispose();
      }),
      panel.webview.onDidReceiveMessage(message => {
        void this.handleMessage(message as WorkbenchMessage);
      })
    );
  }

  private async cancelAllRecordings(): Promise<void> {
    try {
      await LocalAudioRecorderService.cancelRecording();
    } catch {
      // Ignore
    }
    for (const tempPath of Object.values(this.tempRecordingPaths)) {
      try { await fs.unlink(tempPath); } catch { /* ignore */ }
    }
    this.tempRecordingPaths = {};
  }

  private async handleMessage(message: WorkbenchMessage): Promise<void> {
    if (message.type === 'ready') {
      await this.refresh();
      return;
    }

    if (message.type === 'start-recording') {
      const { providerId } = message;
      try {
        if (this.tempRecordingPaths[providerId]) {
          try { await fs.unlink(this.tempRecordingPaths[providerId]); } catch { /* ignore */ }
          delete this.tempRecordingPaths[providerId];
        }
        await LocalAudioRecorderService.cancelRecording();
        this.tempRecordingPaths[providerId] = await LocalAudioRecorderService.startRecording();
        await this.panel.webview.postMessage({
          type: 'recording-started',
          providerId
        } satisfies WorkbenchHostMessage);
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'recording-error',
          providerId,
          message: this.normalizeRecorderError(error)
        } satisfies WorkbenchHostMessage);
      }
      return;
    }

    if (message.type === 'stop-recording') {
      const { providerId } = message;
      try {
        this.tempRecordingPaths[providerId] = await LocalAudioRecorderService.stopRecording();
        const audioSrc = this.panel.webview.asWebviewUri(
          vscode.Uri.file(this.tempRecordingPaths[providerId])
        ).toString();
        await this.panel.webview.postMessage({
          type: 'recording-stopped',
          providerId,
          audioSrc
        } satisfies WorkbenchHostMessage);
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'recording-error',
          providerId,
          message: this.normalizeRecorderError(error)
        } satisfies WorkbenchHostMessage);
      }
      return;
    }

    if (message.type === 'save-recording') {
      const { providerId, referenceText } = message;
      const tempPath = this.tempRecordingPaths[providerId];
      if (!tempPath) {
        await this.panel.webview.postMessage({
          type: 'recording-error',
          providerId,
          message: this.getMicrophoneErrorMessage()
        } satisfies WorkbenchHostMessage);
        return;
      }

      await this.panel.webview.postMessage({
        type: 'busy',
        action: `save-recording:${providerId}`,
        busy: true
      } satisfies WorkbenchHostMessage);
      try {
        const preparedPath = await LocalAudioRecorderService.cleanupRecordingForReference(tempPath);
        if (preparedPath !== tempPath) {
          this.tempRecordingPaths[providerId] = preparedPath;
        }
        const audioBuffer = await fs.readFile(preparedPath);
        await this.handlersRef.saveRecording(
          providerId as 'cosyvoice' | 'qwen3-tts',
          Uint8Array.from(audioBuffer),
          referenceText
        );
        await this.panel.webview.postMessage({
          type: 'recording-reset',
          providerId
        } satisfies WorkbenchHostMessage);
        await this.refresh();
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'recording-error',
          providerId,
          message: error instanceof Error ? error.message : String(error)
        } satisfies WorkbenchHostMessage);
      } finally {
        await this.panel.webview.postMessage({
          type: 'busy',
          action: `save-recording:${providerId}`,
          busy: false
        } satisfies WorkbenchHostMessage);
      }
      return;
    }

    if (message.type === 'select-media') {
      await this.panel.webview.postMessage({
        type: 'busy',
        action: `select-media:${message.providerId}`,
        busy: true
      } satisfies WorkbenchHostMessage);
      try {
        await this.handlersRef.selectMedia(message.providerId as 'cosyvoice' | 'qwen3-tts');
        await this.refresh();
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        } satisfies WorkbenchHostMessage);
      } finally {
        await this.panel.webview.postMessage({
          type: 'busy',
          action: `select-media:${message.providerId}`,
          busy: false
        } satisfies WorkbenchHostMessage);
      }
      return;
    }

    if (message.type === 'transcribe') {
      await this.panel.webview.postMessage({
        type: 'busy',
        action: `transcribe:${message.providerId}`,
        busy: true
      } satisfies WorkbenchHostMessage);
      try {
        await this.handlersRef.transcribe(message.providerId as 'cosyvoice' | 'qwen3-tts');
        await this.refresh();
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        } satisfies WorkbenchHostMessage);
      } finally {
        await this.panel.webview.postMessage({
          type: 'busy',
          action: `transcribe:${message.providerId}`,
          busy: false
        } satisfies WorkbenchHostMessage);
      }
      return;
    }

    if (message.type === 'save-reference-text') {
      await this.panel.webview.postMessage({
        type: 'busy',
        action: `save-reference-text:${message.providerId}`,
        busy: true
      } satisfies WorkbenchHostMessage);
      try {
        await this.handlersRef.saveReferenceText(message.providerId as 'cosyvoice' | 'qwen3-tts', message.text);
        await this.refresh();
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        } satisfies WorkbenchHostMessage);
      } finally {
        await this.panel.webview.postMessage({
          type: 'busy',
          action: `save-reference-text:${message.providerId}`,
          busy: false
        } satisfies WorkbenchHostMessage);
      }
      return;
    }

    if (message.type === 'save-field') {
      await this.panel.webview.postMessage({
        type: 'busy',
        action: message.fieldId,
        busy: true
      } satisfies WorkbenchHostMessage);
      try {
        await this.handlersRef.saveField(message.fieldId, message.value);
        await this.refresh();
      } catch (error) {
        await this.panel.webview.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : String(error)
        } satisfies WorkbenchHostMessage);
      } finally {
        await this.panel.webview.postMessage({
          type: 'busy',
          action: message.fieldId,
          busy: false
        } satisfies WorkbenchHostMessage);
      }
    }
  }

  private async refresh(): Promise<void> {
    const state = await this.handlersRef.getState();

    // Resolve reference audio paths to webview-accessible URIs using the panel's webview.
    for (const provider of state.providers) {
      if (provider.promptAudioPath) {
        try {
          provider.promptAudioWebviewUri = this.panel.webview.asWebviewUri(
            vscode.Uri.file(provider.promptAudioPath)
          ).toString();
        } catch {
          // Path not resolvable — skip preview
        }
      }
    }

    this.panel.title = state.labels.title;
    await this.panel.webview.postMessage({
      type: 'state',
      state
    } satisfies WorkbenchHostMessage);
  }

  private getHtml(webview: vscode.Webview, styleUri: vscode.Uri, scriptUri: vscode.Uri): string {
    const nonce = this.getNonce();
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; media-src ${webview.cspSource} blob: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
  />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Configure Local Models</title>
  <link rel="stylesheet" href="${styleUri}" />
</head>
<body>
  <div class="shell">
    <div class="hero">
      <div class="eyebrow">Speechify Local Models</div>
      <h1 id="title">Configure Local Models</h1>
      <p id="subtitle"></p>
    </div>
    <div class="panel">
      <div class="section-head">
        <div class="section-title" id="providerLabel"></div>
      </div>
      <div class="cards" id="providerCards"></div>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private normalizeRecorderError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const normalized = message.toLowerCase();
    const hostAppName = vscode.env.appName || 'VS Code';

    if (normalized.includes('operation not permitted') || normalized.includes('permission denied')) {
      return vscode.env.language.toLowerCase().startsWith('zh')
        ? `麦克风权限被 ${hostAppName} 或其录音后端拒绝。请确认"系统设置 -> 隐私与安全性 -> 麦克风"里允许 ${hostAppName}，然后完全退出并重开应用后再试。`
        : `Microphone access was denied for ${hostAppName} or its recording backend. Allow ${hostAppName} in System Settings -> Privacy & Security -> Microphone, then fully restart and try again.`;
    }

    if (normalized.includes('input/output error') || normalized.includes('not found')) {
      return vscode.env.language.toLowerCase().startsWith('zh')
        ? '没有拿到可用的麦克风输入设备。请确认系统默认输入设备可用后再试。'
        : 'No usable microphone input device was found. Check that your system default input device is available and try again.';
    }

    return message;
  }

  private getMicrophoneErrorMessage(): string {
    return vscode.env.language.toLowerCase().startsWith('zh')
      ? '录制参考音频失败。请检查麦克风权限和默认输入设备后重试。'
      : 'Failed to record reference audio. Check microphone permission and the default input device.';
  }

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let value = '';
    for (let i = 0; i < 32; i++) {
      value += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return value;
  }

  private dispose(): void {
    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      disposable?.dispose();
    }
  }
}

