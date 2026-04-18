import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import Module = require('module');
import * as os from 'os';
import * as path from 'path';

const ModuleInternals = Module as typeof Module & {
  _load: (request: string, parent: NodeModule | null, isMain: boolean) => unknown;
};
const originalModuleLoad = ModuleInternals._load;

async function withVscodeMock<T>(
  callback: () => Promise<T> | T,
  extraMocks: Record<string, unknown> = {}
): Promise<T> {
  const vscodeMock = {
    workspace: {
      workspaceFolders: undefined,
      getConfiguration: () => ({
        get: <Value>(_: string, defaultValue: Value) => defaultValue,
        update: async () => undefined
      })
    },
    window: {
      withProgress: async <T>(_: unknown, task: (progress: { report: (_: unknown) => void }) => Promise<T>) =>
        task({ report: () => undefined })
    },
    ProgressLocation: {
      Notification: 15
    },
    env: {
      language: 'en'
    }
  };

  ModuleInternals._load = function patchedLoad(request: string, parent: NodeModule | null, isMain: boolean): unknown {
    if (request === 'vscode') {
      return vscodeMock;
    }

    if (request in extraMocks) {
      return extraMocks[request];
    }

    return originalModuleLoad.call(this, request, parent, isMain);
  };

  try {
    return await callback();
  } finally {
    ModuleInternals._load = originalModuleLoad;
  }
}

suite('Qwen3-TTS Audio Contract', () => {
  test('should synthesize qwen3-tts audio through the local mlx-audio runtime', async () => {
    let spawnArgs: string[] | undefined;
    let expectedPythonPath = '';
    const childProcessMock = {
      spawn: ((command: string, args: string[]) => {
        assert.strictEqual(command, expectedPythonPath);
        spawnArgs = args;

        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          kill: () => void;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => undefined;

        process.nextTick(() => {
          const outputPath = path.join(os.tmpdir(), `speechify-qwen-test-${Date.now()}.wav`);
          fs.writeFileSync(outputPath, Buffer.from('FAKE_WAV_DATA'));
          child.stdout.emit('data', Buffer.from([
            'Initializing Qwen3-TTS model...',
            `SPEECHIFY_QWEN_RESULT=${JSON.stringify({
              audioPath: outputPath,
              sampleRate: 24000,
              frameCount: 48000
            })}`
          ].join('\n')));
          child.emit('close', 0);
        });

        return child;
      }) as unknown as typeof import('child_process').spawn
    };

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/referenceMediaService')];
      delete require.cache[require.resolve('../../services/qwenTtsService')];
      delete require.cache[require.resolve('../../services/speechProviderService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { ReferenceMediaService } = require('../../services/referenceMediaService') as typeof import('../../services/referenceMediaService');
      const { SpeechProviderService } = require('../../services/speechProviderService') as typeof import('../../services/speechProviderService');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-qwen-tts-audio-'));
      const originalPromptPath = path.join(tempDir, 'prompt-source.wav');
      const normalizedPromptPath = path.join(tempDir, 'prompt-normalized.wav');
      const fakePythonPath = path.join(tempDir, 'python');
      fs.writeFileSync(originalPromptPath, Buffer.from('ORIGINAL_PROMPT'));
      fs.writeFileSync(normalizedPromptPath, Buffer.from('NORMALIZED_PROMPT'));
      fs.writeFileSync(fakePythonPath, '');
      expectedPythonPath = fakePythonPath;

      const configStub = ConfigManager as unknown as {
        getQwenTtsConfig: () => {
          pythonPath: string;
          model: string;
          promptAudioPath: string;
          promptText: string;
          requestTimeoutSeconds: number;
        };
      };
      const referenceStub = ReferenceMediaService as unknown as {
        normalizePromptAudioToTemp: (inputPath: string) => Promise<string>;
      };

      const originalGetQwenTtsConfig = configStub.getQwenTtsConfig;
      const originalNormalizePromptAudioToTemp = referenceStub.normalizePromptAudioToTemp;

      try {
        configStub.getQwenTtsConfig = () => ({
          pythonPath: fakePythonPath,
          model: 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16',
          promptAudioPath: originalPromptPath,
          promptText: '参考文本',
          requestTimeoutSeconds: 900
        });
        referenceStub.normalizePromptAudioToTemp = async inputPath => {
          assert.strictEqual(inputPath, originalPromptPath);
          return normalizedPromptPath;
        };

        const result = await SpeechProviderService.synthesizeWithMetadata(
          '你好，欢迎来到 Speechify。',
          { name: 'Qwen3-TTS Clone', gender: 'Neutral', style: 'general', locale: 'zh-CN' },
          { providerOverride: 'qwen3-tts' }
        );

        assert.strictEqual(result.audioFormat, 'wav');
        assert.strictEqual(result.debugArtifactExtension, 'txt');
        assert.strictEqual(result.debugArtifactContent, '你好，欢迎来到 Speechify。');
        assert.ok(spawnArgs, 'python synthesis should have been invoked');
        assert.strictEqual(spawnArgs?.[0], '-c');
        assert.ok(spawnArgs?.[1]?.includes('from mlx_audio.tts.utils import load_model'));
        assert.strictEqual(spawnArgs?.[2], 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16');
        assert.strictEqual(spawnArgs?.[4], normalizedPromptPath);
        assert.strictEqual(spawnArgs?.[5], '参考文本');
      } finally {
        configStub.getQwenTtsConfig = originalGetQwenTtsConfig;
        referenceStub.normalizePromptAudioToTemp = originalNormalizePromptAudioToTemp;
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }, { child_process: childProcessMock });
  });

  test('should pass an empty transcript to enable embedding-only qwen3-tts cloning', async () => {
    let spawnArgs: string[] | undefined;
    const childProcessMock = {
      spawn: ((_: string, args: string[]) => {
        spawnArgs = args;

        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          kill: () => void;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => undefined;

        process.nextTick(() => {
          const outputPath = path.join(os.tmpdir(), `speechify-qwen-test-${Date.now()}.wav`);
          fs.writeFileSync(outputPath, Buffer.from('FAKE_WAV_DATA'));
          child.stdout.emit('data', Buffer.from(`SPEECHIFY_QWEN_RESULT=${JSON.stringify({
            audioPath: outputPath,
            sampleRate: 24000,
            frameCount: 24000
          })}`));
          child.emit('close', 0);
        });

        return child;
      }) as typeof import('child_process').spawn
    };

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/referenceMediaService')];
      delete require.cache[require.resolve('../../services/qwenTtsService')];
      delete require.cache[require.resolve('../../services/speechProviderService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { ReferenceMediaService } = require('../../services/referenceMediaService') as typeof import('../../services/referenceMediaService');
      const { SpeechProviderService } = require('../../services/speechProviderService') as typeof import('../../services/speechProviderService');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-qwen-tts-audio-'));
      const originalPromptPath = path.join(tempDir, 'prompt-source.wav');
      const normalizedPromptPath = path.join(tempDir, 'prompt-normalized.wav');
      fs.writeFileSync(originalPromptPath, Buffer.from('ORIGINAL_PROMPT'));
      fs.writeFileSync(normalizedPromptPath, Buffer.from('NORMALIZED_PROMPT'));

      const configStub = ConfigManager as unknown as {
        getQwenTtsConfig: () => {
          pythonPath: string;
          model: string;
          promptAudioPath: string;
          promptText: string;
          requestTimeoutSeconds: number;
        };
      };
      const referenceStub = ReferenceMediaService as unknown as {
        normalizePromptAudioToTemp: (inputPath: string) => Promise<string>;
      };

      const originalGetQwenTtsConfig = configStub.getQwenTtsConfig;
      const originalNormalizePromptAudioToTemp = referenceStub.normalizePromptAudioToTemp;

      try {
        const fakePythonPath = path.join(tempDir, 'python');
        fs.writeFileSync(fakePythonPath, '');

        configStub.getQwenTtsConfig = () => ({
          pythonPath: fakePythonPath,
          model: 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16',
          promptAudioPath: originalPromptPath,
          promptText: '',
          requestTimeoutSeconds: 900
        });
        referenceStub.normalizePromptAudioToTemp = async () => normalizedPromptPath;

        await SpeechProviderService.synthesizeWithMetadata(
          '这是一段没有参考文本的测试。',
          { name: 'Qwen3-TTS Clone', gender: 'Neutral', style: 'general', locale: 'zh-CN' },
          { providerOverride: 'qwen3-tts' }
        );

        assert.ok(spawnArgs, 'python synthesis should have been invoked');
        assert.strictEqual(spawnArgs?.[5], '', 'empty ref_text should be forwarded so the script can enable x_vector_only_mode');
        assert.ok(spawnArgs?.[1]?.includes('kwargs["x_vector_only_mode"] = True'));
      } finally {
        configStub.getQwenTtsConfig = originalGetQwenTtsConfig;
        referenceStub.normalizePromptAudioToTemp = originalNormalizePromptAudioToTemp;
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }, { child_process: childProcessMock });
  });

  test('should allow SpeechService local Qwen generation even when Azure-style preflight completeness is false', async () => {
    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/speechService')];
      delete require.cache[require.resolve('../../services/speechProviderService')];
      delete require.cache[require.resolve('../../utils/audio')];
      delete require.cache[require.resolve('../../utils/config')];
      const { SpeechService } = require('../../services/speechService') as typeof import('../../services/speechService');
      const { SpeechProviderService } = require('../../services/speechProviderService') as typeof import('../../services/speechProviderService');
      const { AudioUtils } = require('../../utils/audio') as typeof import('../../utils/audio');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      const configStub = ConfigManager as unknown as {
        requiresPreflightConfiguration: (_?: string) => boolean;
        isConfigurationComplete: (_?: string) => boolean;
        getVoiceSettings: (_?: string) => { name: string; gender: string; style: string; locale: string };
      };
      const speechProviderStub = SpeechProviderService as unknown as {
        extractTextFromMarkdown: (markdown: string) => string;
        splitTextIntoChunks: (text: string, maxChunkSize: number) => string[];
        synthesizeSpeech: (
          text: string,
          voice: { name: string; gender: string; style: string; locale: string },
          options?: { providerOverride?: string }
        ) => Promise<{ audioBuffer: Buffer; audioFormat: 'wav' }>;
      };
      const audioStub = AudioUtils as unknown as {
        saveAudioFile: (audioBuffer: Buffer, filePath: string) => Promise<void>;
      };

      const originalRequiresPreflightConfiguration = configStub.requiresPreflightConfiguration;
      const originalIsConfigurationComplete = configStub.isConfigurationComplete;
      const originalGetVoiceSettings = configStub.getVoiceSettings;
      const originalExtractTextFromMarkdown = speechProviderStub.extractTextFromMarkdown;
      const originalSplitTextIntoChunks = speechProviderStub.splitTextIntoChunks;
      const originalSynthesizeSpeech = speechProviderStub.synthesizeSpeech;
      const originalSaveAudioFile = audioStub.saveAudioFile;
      const savedPaths: string[] = [];

      try {
        configStub.requiresPreflightConfiguration = () => false;
        configStub.isConfigurationComplete = () => false;
        configStub.getVoiceSettings = () => ({
          name: 'Qwen3-TTS Clone',
          gender: 'Neutral',
          style: 'general',
          locale: 'zh-CN'
        });
        speechProviderStub.extractTextFromMarkdown = markdown => markdown;
        speechProviderStub.splitTextIntoChunks = text => [text];
        speechProviderStub.synthesizeSpeech = async (_text, _voice, options) => {
          assert.strictEqual(options?.providerOverride, 'qwen3-tts');
          return {
            audioBuffer: Buffer.from('FAKE_WAV_DATA'),
            audioFormat: 'wav'
          };
        };
        audioStub.saveAudioFile = async (_audioBuffer, filePath) => {
          savedPaths.push(filePath);
        };

        const result = await SpeechService.convertTextToSpeech(
          '这是一个本地 Qwen 生成测试。',
          '/tmp/qwen-local-test.md',
          { providerOverride: 'qwen3-tts' }
        );

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.processedChunks, 1);
        assert.strictEqual(result.errors.length, 0);
        assert.strictEqual(savedPaths.length, 1);
        assert.strictEqual(result.outputPaths.length, 1);
      } finally {
        configStub.requiresPreflightConfiguration = originalRequiresPreflightConfiguration;
        configStub.isConfigurationComplete = originalIsConfigurationComplete;
        configStub.getVoiceSettings = originalGetVoiceSettings;
        speechProviderStub.extractTextFromMarkdown = originalExtractTextFromMarkdown;
        speechProviderStub.splitTextIntoChunks = originalSplitTextIntoChunks;
        speechProviderStub.synthesizeSpeech = originalSynthesizeSpeech;
        audioStub.saveAudioFile = originalSaveAudioFile;
      }
    });
  });

  test('should still parse the final Qwen payload when stdout contains extra non-json logs', async () => {
    const childProcessMock = {
      spawn: ((...args: unknown[]) => {
        void args;
        const child = new EventEmitter() as EventEmitter & {
          stdout: EventEmitter;
          stderr: EventEmitter;
          kill: () => void;
        };
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => undefined;

        process.nextTick(() => {
          const outputPath = path.join(os.tmpdir(), `speechify-qwen-test-${Date.now()}.wav`);
          fs.writeFileSync(outputPath, Buffer.from('FAKE_WAV_DATA'));
          child.stdout.emit('data', Buffer.from([
            'Initialize tokenizer...',
            'Initialize acoustic model...',
            `SPEECHIFY_QWEN_RESULT=${JSON.stringify({
              audioPath: outputPath,
              sampleRate: 24000,
              frameCount: 36000
            })}`
          ].join('\n')));
          child.emit('close', 0);
        });

        return child as unknown as import('child_process').ChildProcessWithoutNullStreams;
      }) as unknown as typeof import('child_process').spawn
    };

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/referenceMediaService')];
      delete require.cache[require.resolve('../../services/qwenTtsService')];
      delete require.cache[require.resolve('../../services/speechProviderService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { ReferenceMediaService } = require('../../services/referenceMediaService') as typeof import('../../services/referenceMediaService');
      const { SpeechProviderService } = require('../../services/speechProviderService') as typeof import('../../services/speechProviderService');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-qwen-tts-audio-'));
      const originalPromptPath = path.join(tempDir, 'prompt-source.wav');
      const normalizedPromptPath = path.join(tempDir, 'prompt-normalized.wav');
      const fakePythonPath = path.join(tempDir, 'python');
      fs.writeFileSync(originalPromptPath, Buffer.from('ORIGINAL_PROMPT'));
      fs.writeFileSync(normalizedPromptPath, Buffer.from('NORMALIZED_PROMPT'));
      fs.writeFileSync(fakePythonPath, '');

      const configStub = ConfigManager as unknown as {
        getQwenTtsConfig: () => {
          pythonPath: string;
          model: string;
          promptAudioPath: string;
          promptText: string;
          requestTimeoutSeconds: number;
        };
      };
      const referenceStub = ReferenceMediaService as unknown as {
        normalizePromptAudioToTemp: (inputPath: string) => Promise<string>;
      };

      const originalGetQwenTtsConfig = configStub.getQwenTtsConfig;
      const originalNormalizePromptAudioToTemp = referenceStub.normalizePromptAudioToTemp;

      try {
        configStub.getQwenTtsConfig = () => ({
          pythonPath: fakePythonPath,
          model: 'mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16',
          promptAudioPath: originalPromptPath,
          promptText: '参考文本',
          requestTimeoutSeconds: 900
        });
        referenceStub.normalizePromptAudioToTemp = async () => normalizedPromptPath;

        const result = await SpeechProviderService.synthesizeWithMetadata(
          '即使 stdout 前面有初始化日志，也应该正常解析。',
          { name: 'Qwen3-TTS Clone', gender: 'Neutral', style: 'general', locale: 'zh-CN' },
          { providerOverride: 'qwen3-tts' }
        );

        assert.strictEqual(result.audioFormat, 'wav');
        assert.ok(result.durationMs > 0);
      } finally {
        configStub.getQwenTtsConfig = originalGetQwenTtsConfig;
        referenceStub.normalizePromptAudioToTemp = originalNormalizePromptAudioToTemp;
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }, { child_process: childProcessMock });
  });
});
