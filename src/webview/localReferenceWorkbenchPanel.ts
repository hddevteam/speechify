import * as path from 'path';
import * as vscode from 'vscode';

export type LocalReferenceWorkbenchTarget = 'cosyvoice' | 'qwen3-tts' | 'both';
export type LocalReferenceWorkbenchAction = 'record' | 'select-media' | 'transcribe';
export type LocalReferenceWorkbenchFieldId =
  | 'cosyvoice-base-url'
  | 'cosyvoice-prompt-text'
  | 'qwen-python-path'
  | 'qwen-model'
  | 'qwen-prompt-text';

export interface LocalReferenceWorkbenchEditableField {
  id: LocalReferenceWorkbenchFieldId;
  label: string;
  value: string;
  placeholder?: string;
  submitLabel: string;
  multiline?: boolean;
  mono?: boolean;
}

export interface LocalReferenceWorkbenchProviderState {
  id: 'cosyvoice' | 'qwen3-tts';
  title: string;
  editableFields: LocalReferenceWorkbenchEditableField[];
}

export interface LocalReferenceWorkbenchLabels {
  title: string;
  subtitle: string;
  targetLabel: string;
  actionLabel: string;
  providerLabel: string;
  record: string;
  selectMedia: string;
  transcribe: string;
  cosyVoice: string;
  qwenTts: string;
  both: string;
  targetHint: string;
  statusReady: string;
  workingRecord: string;
  workingSelectMedia: string;
  workingTranscribe: string;
  workingSaveField: string;
}

export interface LocalReferenceWorkbenchState {
  target: LocalReferenceWorkbenchTarget;
  labels: LocalReferenceWorkbenchLabels;
  providers: LocalReferenceWorkbenchProviderState[];
}

type WorkbenchMessage =
  | { type: 'ready' }
  | { type: 'set-target'; target: LocalReferenceWorkbenchTarget }
  | { type: 'run-action'; action: LocalReferenceWorkbenchAction }
  | { type: 'save-field'; fieldId: LocalReferenceWorkbenchFieldId; value: string };

type WorkbenchHostMessage =
  | { type: 'state'; state: LocalReferenceWorkbenchState }
  | { type: 'busy'; action: string | null; busy: boolean }
  | { type: 'error'; message: string };

interface LocalReferenceWorkbenchHandlers {
  getState: (target: LocalReferenceWorkbenchTarget) => Promise<LocalReferenceWorkbenchState>;
  performAction: (action: LocalReferenceWorkbenchAction, target: LocalReferenceWorkbenchTarget) => Promise<void>;
  saveField: (fieldId: LocalReferenceWorkbenchFieldId, value: string) => Promise<void>;
}

export class LocalReferenceWorkbenchPanel {
  private static currentPanel: LocalReferenceWorkbenchPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];
  private currentTarget: LocalReferenceWorkbenchTarget = 'both';

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
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media'))]
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
      panel.onDidDispose(() => {
        LocalReferenceWorkbenchPanel.currentPanel = undefined;
        this.dispose();
      }),
      panel.webview.onDidReceiveMessage(message => {
        void this.handleMessage(message as WorkbenchMessage);
      })
    );
  }

  private async handleMessage(message: WorkbenchMessage): Promise<void> {
    if (message.type === 'ready') {
      await this.refresh();
      return;
    }

    if (message.type === 'set-target') {
      this.currentTarget = message.target;
      await this.refresh();
      return;
    }

    if (message.type !== 'run-action') {
      if (message.type !== 'save-field') {
        return;
      }

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

      return;
    }

    await this.panel.webview.postMessage({
      type: 'busy',
      action: message.action,
      busy: true
    } satisfies WorkbenchHostMessage);

    try {
      await this.handlersRef.performAction(message.action, this.currentTarget);
      await this.refresh();
    } catch (error) {
      await this.panel.webview.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error)
      } satisfies WorkbenchHostMessage);
    } finally {
      await this.panel.webview.postMessage({
        type: 'busy',
        action: message.action,
        busy: false
      } satisfies WorkbenchHostMessage);
    }
  }

  private async refresh(): Promise<void> {
    const state = await this.handlersRef.getState(this.currentTarget);
    this.currentTarget = state.target;
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
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"
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
      <div class="section">
        <div class="section-head">
          <div class="section-title" id="targetLabel"></div>
          <div class="section-hint" id="targetHint"></div>
        </div>
        <div class="target-switch">
          <button class="target-btn" id="targetCosy" data-target="cosyvoice"></button>
          <button class="target-btn" id="targetQwen" data-target="qwen3-tts"></button>
          <button class="target-btn" id="targetBoth" data-target="both"></button>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <div class="section-title" id="actionLabel"></div>
          <div class="section-hint" id="busyLabel"></div>
        </div>
        <div class="actions">
          <button class="action-btn" id="recordBtn" data-action="record"></button>
          <button class="action-btn" id="selectBtn" data-action="select-media"></button>
          <button class="action-btn" id="transcribeBtn" data-action="transcribe"></button>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <div class="section-title" id="providerLabel"></div>
        </div>
        <div class="cards" id="providerCards"></div>
      </div>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
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
