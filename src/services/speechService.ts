import * as vscode from 'vscode';
import { ProcessingResult, SpeechExecutionOptions, VideoProcessingResult, VoiceListItem } from '../types';
import { ConfigManager } from '../utils/config';
import { AudioUtils } from '../utils/audio';
import { SubtitleUtils } from '../utils/subtitle';
import { VideoMuxer } from '../utils/videoMuxer';
import { I18n } from '../i18n';
import { PipelineStep, VisionPipelineService } from './visionPipelineService';
import { VoiceConfigurationService } from './voiceConfigurationService';
import { SpeechProviderService } from './speechProviderService';
import { CosyVoiceReferenceService } from './cosyVoiceReferenceService';

/**
 * Main speech synthesis service facade
 */
export class SpeechService {
  private static readonly MAX_CHUNK_SIZE = 3000;
  private static readonly PROCESSING_DELAY = 500;

  public static async convertTextToSpeech(
    text: string,
    sourceFilePath: string,
    options: SpeechExecutionOptions = {}
  ): Promise<ProcessingResult> {
    try {
      if (
        ConfigManager.requiresPreflightConfiguration(options.providerOverride) &&
        !ConfigManager.isConfigurationComplete(options.providerOverride)
      ) {
        throw new Error(I18n.t('errors.configurationIncomplete'));
      }

      const cleanText = SpeechProviderService.extractTextFromMarkdown(text);

      if (!cleanText.trim()) {
        throw new Error(I18n.t('errors.noTextContent'));
      }

      const chunks = SpeechProviderService.splitTextIntoChunks(cleanText, this.MAX_CHUNK_SIZE);
      return await this.processTextChunks(chunks, sourceFilePath, options);
    } catch (error) {
      console.error('Speech conversion failed:', error);
      throw error;
    }
  }

  public static async convertToVideo(
    text: string,
    sourceFilePath: string,
    videoFilePath: string
  ): Promise<VideoProcessingResult> {
    try {
      if (!ConfigManager.isConfigurationComplete()) {
        throw new Error(I18n.t('errors.configurationIncomplete'));
      }

      const cleanText = SpeechProviderService.extractTextFromMarkdown(text);
      const outputFormat = SpeechProviderService.getPreferredOutputFormat();

      const audioOutputPath = AudioUtils.generateOutputPath(sourceFilePath, undefined, 1, outputFormat);
      const audioExtension = `.${outputFormat}`;
      const srtOutputPath = audioOutputPath.replace(new RegExp(`${audioExtension.replace('.', '\\.')}$`), '.srt');
      const videoOutputPath = audioOutputPath.replace(new RegExp(`${audioExtension.replace('.', '\\.')}$`), '_speechify.mp4');

      const { audioBuffer, boundaries } = await SpeechProviderService.synthesizeWithMetadata(
        cleanText,
        ConfigManager.getVoiceSettings()
      );

      await AudioUtils.saveAudioFile(audioBuffer, audioOutputPath);

      const srtContent = SubtitleUtils.generateSRT(boundaries);
      await SubtitleUtils.saveSRTFile(srtContent, srtOutputPath);

      const finalVideoPath = await VideoMuxer.muxVideo(videoFilePath, audioOutputPath, srtOutputPath, videoOutputPath);

      return {
        success: true,
        processedChunks: 1,
        totalChunks: 1,
        outputPaths: [audioOutputPath, srtOutputPath],
        videoOutputPath: finalVideoPath,
        wordBoundaries: boundaries,
        errors: []
      };
    } catch (error) {
      console.error('Video conversion failed:', error);
      throw error;
    }
  }

  public static async convertToVideoWithVision(
    text: string,
    _sourceFilePath: string,
    videoFilePath: string,
    options: {
      startStep?: PipelineStep;
      forceRefine?: boolean;
      openAlignmentEditor?: boolean;
      frameInterval?: number;
      timingPath?: string;
      renderOverrides?: {
        autoTrimVideo?: boolean;
        enableTransitions?: boolean;
        transitionType?: string;
      };
    } = {}
  ): Promise<VideoProcessingResult> {
    return VisionPipelineService.convertToVideoWithVision(text, videoFilePath, options);
  }

  private static async processTextChunks(
    chunks: string[],
    sourceFilePath: string,
    options: SpeechExecutionOptions = {}
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: false,
      processedChunks: 0,
      totalChunks: chunks.length,
      outputPaths: [],
      errors: []
    };

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: I18n.t('progress.convertingToSpeech'),
        cancellable: false
      },
      async progress => {
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          if (!chunk) continue;

          progress.report({
            message: I18n.t('progress.processingChunk', (i + 1).toString(), chunks.length.toString()),
            increment: (i / chunks.length) * 100
          });

          try {
            const voiceSettings = ConfigManager.getVoiceSettings(options.providerOverride);
            const outputFormat = SpeechProviderService.getPreferredOutputFormat(options);
            const outputPath = AudioUtils.generateOutputPath(
              sourceFilePath,
              chunks.length > 1 ? i : undefined,
              chunks.length,
              outputFormat
            );

            const { audioBuffer } = await SpeechProviderService.synthesizeSpeech(chunk, voiceSettings, options);
            await AudioUtils.saveAudioFile(audioBuffer, outputPath);

            result.outputPaths.push(outputPath);
            result.processedChunks++;

            if (i < chunks.length - 1) {
              await this.delay(this.PROCESSING_DELAY);
            }
          } catch (error) {
            result.errors.push(`Chunk ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            console.error(`Failed to process chunk ${i + 1}:`, error);
          }
        }
      }
    );

    result.success = result.processedChunks > 0;
    return result;
  }

  public static setExtensionContext(context: vscode.ExtensionContext): void {
    VisionPipelineService.setExtensionContext(context);
    VoiceConfigurationService.setExtensionContext(context);
    CosyVoiceReferenceService.setExtensionContext(context);
  }

  public static async openAlignmentEditorForVideo(inputPath: string): Promise<void> {
    await VisionPipelineService.openAlignmentEditorForVideo(inputPath);
  }

  public static async synthesizeVideoFromProject(input: string | vscode.Uri): Promise<void> {
    await VisionPipelineService.synthesizeVideoFromProject(input);
  }

  public static getVoiceList(): VoiceListItem[] {
    return VoiceConfigurationService.getVoiceList();
  }

  public static filterVoiceList(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem,
    value?: string
  ): VoiceListItem[] {
    return VoiceConfigurationService.filterVoiceList(voiceList, attribute, value);
  }

  public static getUniqueValues(voiceList: VoiceListItem[], attribute: keyof VoiceListItem): string[] {
    return VoiceConfigurationService.getUniqueValues(voiceList, attribute);
  }

  public static createVoiceQuickPickItems(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem,
    defaultValue?: string
  ): vscode.QuickPickItem[] {
    return VoiceConfigurationService.createVoiceQuickPickItems(voiceList, attribute, defaultValue);
  }

  public static async showConfigurationWizard(providerOverride?: SpeechExecutionOptions['providerOverride']): Promise<void> {
    await VoiceConfigurationService.showConfigurationWizard(providerOverride);
  }

  public static async configureAzureSettings(): Promise<void> {
    await VoiceConfigurationService.configureAzureSettings();
  }

  public static async configureCosyVoiceSettings(): Promise<void> {
    await VoiceConfigurationService.configureCosyVoiceSettings();
  }

  public static async configureQwenTtsSettings(): Promise<void> {
    await VoiceConfigurationService.configureQwenTtsSettings();
  }

  public static async selectQwenTtsPythonPathFromDialog(): Promise<string | undefined> {
    return await VoiceConfigurationService.selectQwenTtsPythonPathFromDialog();
  }

  public static async recordCosyVoiceReferenceAudio(): Promise<void> {
    await VoiceConfigurationService.recordCosyVoiceReferenceAudio();
  }

  public static async recordQwenTtsReferenceAudio(): Promise<void> {
    await VoiceConfigurationService.recordQwenTtsReferenceAudio();
  }

  public static async openSpeechifySettingsJson(): Promise<void> {
    await VoiceConfigurationService.openSpeechifySettingsJson();
  }

  public static async configureVisionSettings(): Promise<void> {
    await VoiceConfigurationService.configureVisionSettings();
  }

  public static async configureVoiceSettings(): Promise<void> {
    await VoiceConfigurationService.configureVoiceSettings();
  }

  public static async selectVoiceStyleQuickly(): Promise<void> {
    await VoiceConfigurationService.selectVoiceStyleQuickly();
  }

  public static async selectVoiceRole(): Promise<void> {
    await VoiceConfigurationService.selectVoiceRole();
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export { PipelineStep };
