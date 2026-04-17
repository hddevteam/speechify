import * as assert from 'assert';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as http from 'http';
import Module = require('module');
import * as os from 'os';
import * as path from 'path';
import { buildCosyVoiceNormalizeArgs, COSYVOICE_MAX_PROMPT_DURATION_SEC } from '../../utils/cosyVoiceAudio';

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

suite('CosyVoice Audio Contract', () => {
  test('should normalize prompt audio to wav mono 16k and trim to safe max duration', () => {
    const args = buildCosyVoiceNormalizeArgs('/tmp/in.mp3', '/tmp/out.wav');

    assert.ok(args.includes('-i'));
    assert.ok(args.includes('/tmp/in.mp3'));
    assert.ok(args.includes('-ac'));
    assert.ok(args.includes('1'));
    assert.ok(args.includes('-ar'));
    assert.ok(args.includes('16000'));
    assert.ok(args.includes('-c:a'));
    assert.ok(args.includes('pcm_s16le'));
    assert.ok(args.includes('-t'));
    assert.ok(args.includes(COSYVOICE_MAX_PROMPT_DURATION_SEC.toString()));
    assert.strictEqual(args[args.length - 1], '/tmp/out.wav');
  });

  test('should force-refresh normalized prompt audio after backend reports stale overlong prompt', async () => {
    const requestBodies: string[] = [];
    let requestCount = 0;
    const httpMock = {
      ...http,
      request: ((_options: unknown, callback?: (response: http.IncomingMessage) => void) => {
        const request = new EventEmitter() as EventEmitter & {
          write: (chunk: Buffer | string) => void;
          end: () => void;
          destroy: (error?: Error) => void;
        };
        const chunks: Buffer[] = [];
        const callbackFn = callback as (response: http.IncomingMessage) => void;

        request.write = (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        };
        request.destroy = (error?: Error) => {
          if (error) {
            request.emit('error', error);
          }
        };
        request.end = () => {
          requestCount++;
          const body = Buffer.concat(chunks).toString('latin1');
          requestBodies.push(body);

          const response = new EventEmitter() as EventEmitter & {
            statusCode?: number;
            statusMessage?: string;
          };
          response.statusCode = requestCount === 1 ? 500 : 200;
          response.statusMessage = requestCount === 1 ? 'Internal Server Error' : 'OK';
          callbackFn(response as http.IncomingMessage);

          process.nextTick(() => {
            if (requestCount === 1) {
              response.emit('data', Buffer.from('AssertionError: do not support extract speech token for audio longer than 30s'));
            } else {
              response.emit('data', Buffer.alloc(2205 * 2, 0x11));
            }
            response.emit('end');
          });
        };

        return request as unknown as http.ClientRequest;
      }) as typeof http.request
    };

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/referenceMediaService')];
      delete require.cache[require.resolve('../../services/speechProviderService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { ReferenceMediaService } = require('../../services/referenceMediaService') as typeof import('../../services/referenceMediaService');
      const { SpeechProviderService } = require('../../services/speechProviderService') as typeof import('../../services/speechProviderService');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-cosyvoice-audio-'));
      const originalPromptPath = path.join(tempDir, 'prompt-source.wav');
      const stalePromptPath = path.join(tempDir, 'prompt-stale.wav');
      const refreshedPromptPath = path.join(tempDir, 'prompt-refreshed.wav');
      fs.writeFileSync(originalPromptPath, Buffer.from('ORIGINAL_PROMPT'));
      fs.writeFileSync(stalePromptPath, Buffer.from('STALE_PROMPT'));
      fs.writeFileSync(refreshedPromptPath, Buffer.from('REFRESHED_PROMPT'));

      const configStub = ConfigManager as unknown as {
        getCosyVoiceConfig: () => { baseUrl: string; promptAudioPath: string; promptText: string };
      };
      const referenceStub = ReferenceMediaService as unknown as {
        normalizePromptAudioToTemp: (inputPath: string) => Promise<string>;
      };
      const cacheStub = SpeechProviderService as unknown as {
        cosyVoicePreparedPromptCache: Map<string, string>;
      };

      const originalGetCosyVoiceConfig = configStub.getCosyVoiceConfig;
      const originalNormalizePromptAudioToTemp = referenceStub.normalizePromptAudioToTemp;
      cacheStub.cosyVoicePreparedPromptCache.clear();

      let normalizeCallCount = 0;

      try {
        configStub.getCosyVoiceConfig = () => ({
          baseUrl: 'http://cosyvoice.test',
          promptAudioPath: originalPromptPath,
          promptText: '参考文本'
        });

        referenceStub.normalizePromptAudioToTemp = async (inputPath: string) => {
          assert.strictEqual(inputPath, originalPromptPath);
          normalizeCallCount++;
          return normalizeCallCount === 1 ? stalePromptPath : refreshedPromptPath;
        };

        const result = await SpeechProviderService.synthesizeWithMetadata(
          '请生成一段本地语音。',
          { name: 'CosyVoice Clone', gender: 'Neutral', style: 'general', locale: 'zh-CN' },
          { providerOverride: 'cosyvoice' }
        );

        assert.strictEqual(normalizeCallCount, 2, 'should retry prompt normalization once after a prompt-too-long backend error');
        assert.strictEqual(requestCount, 2, 'should retry the backend request once');
        assert.ok(requestBodies[0]?.includes('STALE_PROMPT'), 'first attempt should send the stale cached prompt audio');
        assert.ok(requestBodies[1]?.includes('REFRESHED_PROMPT'), 'retry should send the refreshed normalized prompt audio');
        assert.strictEqual(result.audioFormat, 'wav');
        assert.ok(result.audioBuffer.length > 44, 'returned audio should be wrapped into a WAV buffer');
      } finally {
        configStub.getCosyVoiceConfig = originalGetCosyVoiceConfig;
        referenceStub.normalizePromptAudioToTemp = originalNormalizePromptAudioToTemp;
        cacheStub.cosyVoicePreparedPromptCache.clear();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }, { http: httpMock });
  });

  test('should surface a clear error when backend still rejects prompt audio after refresh', async () => {
    const httpMock = {
      ...http,
      request: ((_options: unknown, callback?: (response: http.IncomingMessage) => void) => {
        const request = new EventEmitter() as EventEmitter & {
          write: (chunk: Buffer | string) => void;
          end: () => void;
          destroy: (error?: Error) => void;
        };
        const callbackFn = callback as (response: http.IncomingMessage) => void;

        request.write = () => undefined;
        request.destroy = (error?: Error) => {
          if (error) {
            request.emit('error', error);
          }
        };
        request.end = () => {
          const response = new EventEmitter() as EventEmitter & {
            statusCode?: number;
            statusMessage?: string;
          };
          response.statusCode = 500;
          response.statusMessage = 'Internal Server Error';
          callbackFn(response as http.IncomingMessage);

          process.nextTick(() => {
            response.emit('data', Buffer.from('AssertionError: do not support extract speech token for audio longer than 30s'));
            response.emit('end');
          });
        };

        return request as unknown as http.ClientRequest;
      }) as typeof http.request
    };

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/referenceMediaService')];
      delete require.cache[require.resolve('../../services/speechProviderService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { ReferenceMediaService } = require('../../services/referenceMediaService') as typeof import('../../services/referenceMediaService');
      const { SpeechProviderService } = require('../../services/speechProviderService') as typeof import('../../services/speechProviderService');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-cosyvoice-audio-'));
      const originalPromptPath = path.join(tempDir, 'prompt-source.wav');
      const refreshedPromptPath = path.join(tempDir, 'prompt-refreshed.wav');
      fs.writeFileSync(originalPromptPath, Buffer.from('ORIGINAL_PROMPT'));
      fs.writeFileSync(refreshedPromptPath, Buffer.from('REFRESHED_PROMPT'));

      const configStub = ConfigManager as unknown as {
        getCosyVoiceConfig: () => { baseUrl: string; promptAudioPath: string; promptText: string };
      };
      const referenceStub = ReferenceMediaService as unknown as {
        normalizePromptAudioToTemp: (inputPath: string) => Promise<string>;
      };
      const cacheStub = SpeechProviderService as unknown as {
        cosyVoicePreparedPromptCache: Map<string, string>;
      };

      const originalGetCosyVoiceConfig = configStub.getCosyVoiceConfig;
      const originalNormalizePromptAudioToTemp = referenceStub.normalizePromptAudioToTemp;
      cacheStub.cosyVoicePreparedPromptCache.clear();

      try {
        configStub.getCosyVoiceConfig = () => ({
          baseUrl: 'http://cosyvoice.test',
          promptAudioPath: originalPromptPath,
          promptText: '参考文本'
        });

        referenceStub.normalizePromptAudioToTemp = async (inputPath: string) => {
          assert.strictEqual(inputPath, originalPromptPath);
          fs.writeFileSync(refreshedPromptPath, Buffer.from('REFRESHED_PROMPT'));
          return refreshedPromptPath;
        };

        await assert.rejects(
          () =>
            SpeechProviderService.synthesizeWithMetadata(
              '请生成一段本地语音。',
              { name: 'CosyVoice Clone', gender: 'Neutral', style: 'general', locale: 'zh-CN' },
              { providerOverride: 'cosyvoice' }
            ),
          error =>
            error instanceof Error &&
            error.message.includes('CosyVoice reference audio exceeds the model limit of 30 seconds.')
        );
      } finally {
        configStub.getCosyVoiceConfig = originalGetCosyVoiceConfig;
        referenceStub.normalizePromptAudioToTemp = originalNormalizePromptAudioToTemp;
        cacheStub.cosyVoicePreparedPromptCache.clear();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }, { http: httpMock });
  });

  test('should include request context in timeout errors for local CosyVoice calls', async () => {
    let capturedTimeout: number | undefined;
    const httpMock = {
      ...http,
      request: ((options: unknown) => {
        const request = new EventEmitter() as EventEmitter & {
          write: (chunk: Buffer | string) => void;
          end: () => void;
          destroy: (error?: Error) => void;
        };
        capturedTimeout = (options as { timeout?: number }).timeout;

        request.write = () => undefined;
        request.destroy = (error?: Error) => {
          if (error) {
            request.emit('error', error);
          }
        };
        request.end = () => {
          process.nextTick(() => {
            request.emit('timeout');
          });
        };

        return request as unknown as http.ClientRequest;
      }) as typeof http.request
    };

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/referenceMediaService')];
      delete require.cache[require.resolve('../../services/speechProviderService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { ReferenceMediaService } = require('../../services/referenceMediaService') as typeof import('../../services/referenceMediaService');
      const { SpeechProviderService } = require('../../services/speechProviderService') as typeof import('../../services/speechProviderService');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-cosyvoice-audio-'));
      const originalPromptPath = path.join(tempDir, 'prompt-source.wav');
      const normalizedPromptPath = path.join(tempDir, 'prompt-normalized.wav');
      fs.writeFileSync(originalPromptPath, Buffer.from('ORIGINAL_PROMPT'));
      fs.writeFileSync(normalizedPromptPath, Buffer.from('NORMALIZED_PROMPT'));

      const configStub = ConfigManager as unknown as {
        getCosyVoiceConfig: () => { baseUrl: string; promptAudioPath: string; promptText: string; requestTimeoutSeconds: number };
      };
      const referenceStub = ReferenceMediaService as unknown as {
        normalizePromptAudioToTemp: (inputPath: string) => Promise<string>;
      };
      const cacheStub = SpeechProviderService as unknown as {
        cosyVoicePreparedPromptCache: Map<string, string>;
      };

      const originalGetCosyVoiceConfig = configStub.getCosyVoiceConfig;
      const originalNormalizePromptAudioToTemp = referenceStub.normalizePromptAudioToTemp;
      cacheStub.cosyVoicePreparedPromptCache.clear();

      try {
        configStub.getCosyVoiceConfig = () => ({
          baseUrl: 'http://cosyvoice.test',
          promptAudioPath: originalPromptPath,
          promptText: '参考文本',
          requestTimeoutSeconds: 300
        });

        referenceStub.normalizePromptAudioToTemp = async (inputPath: string) => {
          assert.strictEqual(inputPath, originalPromptPath);
          return normalizedPromptPath;
        };

        await assert.rejects(
          () =>
            SpeechProviderService.synthesizeWithMetadata(
              '短文本也要能看出超时上下文',
              { name: 'CosyVoice Clone', gender: 'Neutral', style: 'general', locale: 'zh-CN' },
              { providerOverride: 'cosyvoice' }
            ),
          error =>
            error instanceof Error &&
            error.message.includes('CosyVoice request timed out after 300s.') &&
            error.message.includes('endpoint=inference_zero_shot') &&
            error.message.includes('textLength=')
        );
        assert.strictEqual(capturedTimeout, 300_000, 'local CosyVoice should use its configured request timeout');
      } finally {
        configStub.getCosyVoiceConfig = originalGetCosyVoiceConfig;
        referenceStub.normalizePromptAudioToTemp = originalNormalizePromptAudioToTemp;
        cacheStub.cosyVoicePreparedPromptCache.clear();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }, { http: httpMock });
  });

  test('should clamp local CosyVoice timeout to a safe minimum', async () => {
    let capturedTimeout: number | undefined;
    const httpMock = {
      ...http,
      request: ((options: unknown) => {
        const request = new EventEmitter() as EventEmitter & {
          write: (chunk: Buffer | string) => void;
          end: () => void;
          destroy: (error?: Error) => void;
        };
        capturedTimeout = (options as { timeout?: number }).timeout;

        request.write = () => undefined;
        request.destroy = (error?: Error) => {
          if (error) {
            request.emit('error', error);
          }
        };
        request.end = () => {
          process.nextTick(() => {
            request.emit('timeout');
          });
        };

        return request as unknown as http.ClientRequest;
      }) as typeof http.request
    };

    await withVscodeMock(async () => {
      delete require.cache[require.resolve('../../services/referenceMediaService')];
      delete require.cache[require.resolve('../../services/speechProviderService')];
      delete require.cache[require.resolve('../../utils/config')];
      const { ReferenceMediaService } = require('../../services/referenceMediaService') as typeof import('../../services/referenceMediaService');
      const { SpeechProviderService } = require('../../services/speechProviderService') as typeof import('../../services/speechProviderService');
      const { ConfigManager } = require('../../utils/config') as typeof import('../../utils/config');

      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'speechify-cosyvoice-audio-'));
      const originalPromptPath = path.join(tempDir, 'prompt-source.wav');
      const normalizedPromptPath = path.join(tempDir, 'prompt-normalized.wav');
      fs.writeFileSync(originalPromptPath, Buffer.from('ORIGINAL_PROMPT'));
      fs.writeFileSync(normalizedPromptPath, Buffer.from('NORMALIZED_PROMPT'));

      const configStub = ConfigManager as unknown as {
        getCosyVoiceConfig: () => { baseUrl: string; promptAudioPath: string; promptText: string; requestTimeoutSeconds: number };
      };
      const referenceStub = ReferenceMediaService as unknown as {
        normalizePromptAudioToTemp: (inputPath: string) => Promise<string>;
      };
      const cacheStub = SpeechProviderService as unknown as {
        cosyVoicePreparedPromptCache: Map<string, string>;
      };

      const originalGetCosyVoiceConfig = configStub.getCosyVoiceConfig;
      const originalNormalizePromptAudioToTemp = referenceStub.normalizePromptAudioToTemp;
      cacheStub.cosyVoicePreparedPromptCache.clear();

      try {
        configStub.getCosyVoiceConfig = () => ({
          baseUrl: 'http://cosyvoice.test',
          promptAudioPath: originalPromptPath,
          promptText: '参考文本',
          requestTimeoutSeconds: 5
        });

        referenceStub.normalizePromptAudioToTemp = async () => normalizedPromptPath;

        await assert.rejects(
          () =>
            SpeechProviderService.synthesizeWithMetadata(
              '短文本也要有最小保护超时',
              { name: 'CosyVoice Clone', gender: 'Neutral', style: 'general', locale: 'zh-CN' },
              { providerOverride: 'cosyvoice' }
            ),
          error => error instanceof Error && error.message.includes('timed out after 30s.')
        );
        assert.strictEqual(capturedTimeout, 30_000, 'timeout should be clamped to the 30-second minimum');
      } finally {
        configStub.getCosyVoiceConfig = originalGetCosyVoiceConfig;
        referenceStub.normalizePromptAudioToTemp = originalNormalizePromptAudioToTemp;
        cacheStub.cosyVoicePreparedPromptCache.clear();
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    }, { http: httpMock });
  });
});
