import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AzureConfig, VideoProcessingResult, VoiceSettings, WordBoundary } from '../types';
import { ConfigManager, VisionConfigValidationResult } from '../utils/config';
import { AzureSpeechService } from '../utils/azure';
import { AudioUtils } from '../utils/audio';
import { SubtitleUtils } from '../utils/subtitle';
import { VideoMuxer } from '../utils/videoMuxer';
import { VideoAnalyzer, TimingAudioConfig, TimingSegment, TimingProject } from '../utils/videoAnalyzer';
import { AlignmentEditor, AlignmentResult } from '../webview/alignmentEditor';
import { I18n } from '../i18n';
import { buildVisionConfigGuidance, buildVisionRuntimeGuidance } from './visionGuidance';
import { calculateShiftedSegments, ShiftedSegment } from './segmentTiming';
import { composeFinalAudioTrack, mergeAudioWithOffsets } from './ffmpegAudio';

export enum PipelineStep {
  ANALYZE = 'analyze',
  REFINE = 'refine',
  SSML = 'ssml',
  SYNTHESIZE = 'synthesize',
  MUX = 'mux'
}

export class VisionPipelineService {
  private static extensionContext: vscode.ExtensionContext | null = null;

  public static setExtensionContext(context: vscode.ExtensionContext): void {
    this.extensionContext = context;
  }

  public static async convertToVideoWithVision(
    text: string,
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
    let visionValidation: VisionConfigValidationResult | null = null;

    try {
      if (!ConfigManager.isConfigurationComplete()) {
        throw new Error(I18n.t('errors.configurationIncomplete'));
      }

      const visionConfig = ConfigManager.getVisionConfig();
      visionValidation = ConfigManager.validateVisionSettings(visionConfig);
      if (!visionValidation.isValid) {
        throw new Error(buildVisionConfigGuidance(visionValidation, I18n.t));
      }

      const azureConfig = ConfigManager.getAzureConfigForTesting();
      const voiceSettings = ConfigManager.getVoiceSettings();
      const cleanText = AzureSpeechService.extractTextFromMarkdown(text);

      const analyzer = new VideoAnalyzer();
      const outputDir = path.dirname(videoFilePath);
      const projectName = path.basename(videoFilePath, path.extname(videoFilePath));
      const projectDir = options.timingPath
        ? path.dirname(options.timingPath)
        : path.join(outputDir, `${projectName}_vision_project`);
      if (!fs.existsSync(projectDir)) {
        fs.mkdirSync(projectDir, { recursive: true });
      }

      const timingPath = options.timingPath || path.join(projectDir, 'timing.json');
      const ssmlDir = path.join(projectDir, 'ssml');
      const audioDir = path.join(projectDir, 'audio');
      const boundariesDir = path.join(projectDir, 'boundaries');

      [ssmlDir, audioDir, boundariesDir].forEach(dir => {
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      });

      let segments: TimingSegment[] = [];
      let projectAudioConfig: TimingAudioConfig | undefined;

      const saveProject = (segs: TimingSegment[]): void => {
        const project: TimingProject = {
          version: '2.0',
          videoName: path.basename(videoFilePath),
          lastModified: new Date().toISOString(),
          ...(projectAudioConfig ? { audio: projectAudioConfig } : {}),
          segments: segs
        };
        fs.writeFileSync(timingPath, JSON.stringify(project, null, 2));
      };

      if (!options.startStep || options.startStep === PipelineStep.ANALYZE) {
        segments = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: I18n.t('progress.analyzingVideo'),
            cancellable: false
          },
          async () => {
            const totalDuration = await analyzer.getVideoDuration(videoFilePath);
            const interval = options.frameInterval || 10;
            const frames = await analyzer.extractFrames(videoFilePath, interval);
            const timingResult = await analyzer.analyzeTiming(
              frames,
              cleanText,
              totalDuration,
              visionConfig.apiKey,
              visionConfig.endpoint,
              visionConfig.deployment,
              interval
            );
            return timingResult.segments || [];
          }
        );

        saveProject(segments);
      } else if (fs.existsSync(timingPath)) {
        const data = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
        segments = Array.isArray(data) ? data : data.segments;
        projectAudioConfig = this.extractAudioConfig(data);
      }

      const shouldOpenEditor =
        options.openAlignmentEditor !== false && (!options.startStep || options.startStep === PipelineStep.ANALYZE);

      if (shouldOpenEditor) {
        const result = await this.openAlignmentEditor(videoFilePath, timingPath, segments);
        if (!result) {
          throw new Error(I18n.t('errors.alignmentEditorCanceled'));
        }
        segments = result.segments;
        if (result.audio) {
          projectAudioConfig = {
            ...projectAudioConfig,
            ...result.audio
          };
          saveProject(segments);
        }
      }

      const shouldRefine = options.forceRefine || options.startStep === PipelineStep.REFINE;
      if (shouldRefine) {
        segments = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: I18n.t('progress.refiningScript'),
            cancellable: false
          },
          async () =>
            this.refineSegmentsWithCalibration(
              analyzer,
              segments,
              videoFilePath,
              cleanText,
              visionConfig,
              azureConfig,
              voiceSettings
            )
        );
        saveProject(segments);
      } else {
        const data = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
        segments = Array.isArray(data) ? data : data.segments;
        projectAudioConfig = this.extractAudioConfig(data);
      }

      if (
        !options.startStep ||
        [PipelineStep.ANALYZE, PipelineStep.REFINE, PipelineStep.SSML].includes(options.startStep)
      ) {
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (!seg) continue;
          const content = seg.adjustedContent || seg.content;
          const ssml = AzureSpeechService.createSSML(content, voiceSettings);
          fs.writeFileSync(path.join(ssmlDir, `seg_${i}.ssml`), ssml);
        }
      }

      const allBoundaries: WordBoundary[] = [];
      if (
        !options.startStep ||
        [PipelineStep.ANALYZE, PipelineStep.REFINE, PipelineStep.SSML, PipelineStep.SYNTHESIZE].includes(
          options.startStep
        )
      ) {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: I18n.t('progress.synthesizingAudio'),
            cancellable: false
          },
          async progress => {
            for (let i = 0; i < segments.length; i++) {
              const seg = segments[i];
              if (!seg) continue;

              progress.report({
                message: I18n.t('progress.processingChunk', (i + 1).toString(), segments.length.toString())
              });

              const startTimeMs = seg.startTime * 1000;
              const { audioBuffer, boundaries } = await AzureSpeechService.synthesizeWithBoundaries(
                seg.adjustedContent || seg.content,
                voiceSettings,
                azureConfig
              );

              const segAudioPath = path.join(audioDir, `seg_${i}.mp3`);
              const segBoundariesPath = path.join(boundariesDir, `seg_${i}.json`);

              await AudioUtils.saveAudioFile(audioBuffer, segAudioPath);
              fs.writeFileSync(segBoundariesPath, JSON.stringify(boundaries, null, 2));

              seg.audioPath = segAudioPath;
              if (boundaries.length > 0) {
                const lastB = boundaries[boundaries.length - 1];
                if (lastB) {
                  seg.audioDuration = (lastB.audioOffset + lastB.duration) / 1000;
                }
              }

              const shiftedBoundaries = boundaries.map(b => ({
                ...b,
                audioOffset: b.audioOffset + startTimeMs
              }));
              allBoundaries.push(...shiftedBoundaries);
            }
          }
        );
      } else {
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (!seg) continue;
          seg.audioPath = path.join(audioDir, `seg_${i}.mp3`);
          const boundariesPath = path.join(boundariesDir, `seg_${i}.json`);
          if (fs.existsSync(boundariesPath)) {
            const boundaries = JSON.parse(fs.readFileSync(boundariesPath, 'utf-8')) as WordBoundary[];
            if (boundaries.length > 0) {
              const lastB = boundaries[boundaries.length - 1];
              if (lastB) {
                seg.audioDuration = (lastB.audioOffset + lastB.duration) / 1000;
              }
            }
            const startTimeMs = seg.startTime * 1000;
            allBoundaries.push(
              ...boundaries.map(b => ({
                ...b,
                audioOffset: b.audioOffset + startTimeMs
              }))
            );
          }
        }
      }

      return await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: I18n.t('progress.convertingToVideo'),
          cancellable: false
        },
        async () => {
          const config = ConfigManager.getWorkspaceConfig();
          const enableTransitions =
            options.renderOverrides?.enableTransitions !== undefined
              ? options.renderOverrides.enableTransitions
              : (config.enableTransitions ?? true);

          const autoTrimVideo =
            options.renderOverrides?.autoTrimVideo !== undefined
              ? options.renderOverrides.autoTrimVideo
              : (config.autoTrimVideo ?? true);

          const transitionType =
            options.renderOverrides?.transitionType !== undefined
              ? options.renderOverrides.transitionType
              : (config.transitionType ?? 'fade');

          const shiftedSegments = calculateShiftedSegments(segments, {
            autoTrimVideo,
            enableTransitions
          }) as ShiftedSegment[];

          const mergedAudioPath = path.join(projectDir, 'merged_final.mp3');
          const mergePlan = shiftedSegments.map((s, i) => {
              const next = shiftedSegments[i + 1];
              const slotDuration = next
                ? Math.max(0.05, next.targetStartTime - s.targetStartTime)
                : Math.max(0.05, s.targetDuration);
              const spokenDuration = typeof s.audioDuration === 'number' && Number.isFinite(s.audioDuration)
                ? Math.max(0.05, s.audioDuration + 0.03)
                : null;
              const trimDuration = spokenDuration !== null
                ? Math.max(0.05, Math.min(slotDuration, spokenDuration))
                : slotDuration;
              return {
                audioPath: s.audioPath || '',
                startTime: s.targetStartTime,
                ...(typeof trimDuration === 'number' ? { maxDurationSec: trimDuration } : {})
              };
            });
          console.log('[Pipeline] Merge plan diagnostics:', mergePlan.map((m, i) => ({
            index: i,
            startTime: Number(m.startTime.toFixed(3)),
            maxDurationSec: m.maxDurationSec !== undefined ? Number(m.maxDurationSec.toFixed(3)) : null,
            audioPath: m.audioPath
          })));
          await mergeAudioWithOffsets(mergePlan, mergedAudioPath);

          const finalAudioPath = path.join(projectDir, 'final_mix.m4a');
          const muxAudioPath = await composeFinalAudioTrack({
            videoSourcePath: videoFilePath,
            narrationAudioPath: mergedAudioPath,
            outputPath: finalAudioPath,
            segments: shiftedSegments,
            ...(projectAudioConfig ? { audioConfig: projectAudioConfig } : {})
          });

          const srtOutputPath = path.join(projectDir, 'final.srt');
          const shiftedBoundaryGroups: WordBoundary[][] = [];

          for (let i = 0; i < segments.length; i++) {
            const ss = shiftedSegments[i];
            if (!ss) continue;
            const startTimeMs = ss.targetStartTime * 1000;
            const boundaries = JSON.parse(
              fs.readFileSync(path.join(boundariesDir, `seg_${i}.json`), 'utf-8')
            ) as WordBoundary[];
            shiftedBoundaryGroups.push(
              boundaries.map((b: WordBoundary) => ({
                ...b,
                audioOffset: b.audioOffset + startTimeMs
              }))
            );
          }

          const shiftedBoundaries = SubtitleUtils.mergeSegmentBoundariesForSrt(shiftedBoundaryGroups);
          const srtContent = SubtitleUtils.generateSRT(shiftedBoundaries);
          await SubtitleUtils.saveSRTFile(srtContent, srtOutputPath);

          const videoOutputPath = path.join(outputDir, `${projectName}_refined_vision.mp4`);
          const finalVideoPath = await VideoMuxer.muxVideoWithSegments(
            videoFilePath,
            muxAudioPath,
            srtOutputPath,
            videoOutputPath,
            shiftedSegments,
            {
              enableTransitions,
              transitionType,
              autoTrimVideo
            }
          );

          return {
            success: true,
            processedChunks: segments.length,
            totalChunks: segments.length,
            outputPaths: [mergedAudioPath, muxAudioPath, srtOutputPath],
            videoOutputPath: finalVideoPath,
            wordBoundaries: allBoundaries,
            errors: []
          };
        }
      );
    } catch (error) {
      const guidedMessage = buildVisionRuntimeGuidance(error, visionValidation, I18n.t);
      if (guidedMessage) {
        throw new Error(guidedMessage);
      }
      throw error;
    }
  }

  public static async openAlignmentEditorForVideo(inputPath: string): Promise<void> {
    if (!ConfigManager.isConfigurationComplete()) {
      await VoiceConfigurationFallback.showConfigurationWizard();
      return;
    }

    let timingPath: string;
    let videoFilePath: string;

    if (inputPath.toLowerCase().endsWith('.json')) {
      timingPath = inputPath;
      videoFilePath = '';
    } else {
      videoFilePath = inputPath;
      const projectDir = this.getVisionProjectDir(videoFilePath);
      timingPath = path.join(projectDir, 'timing.json');
    }

    if (!fs.existsSync(timingPath)) {
      vscode.window.showErrorMessage(I18n.t('errors.alignmentTimingNotFound'));
      return;
    }

    const content = fs.readFileSync(timingPath, 'utf-8');
    let data: unknown;
    try {
      data = JSON.parse(content);
    } catch (e) {
      vscode.window.showErrorMessage(I18n.t('errors.invalidRequest', 'Invalid JSON format'));
      return;
    }

    let segments: TimingSegment[];

    // Auto-detect and upgrade legacy array format
    if (Array.isArray(data)) {
      const upgradedProject: TimingProject = {
        version: '2.0',
        videoName: videoFilePath ? path.basename(videoFilePath) : 'unknown_video.mp4',
        lastModified: new Date().toISOString(),
        segments: data
      };
      fs.writeFileSync(timingPath, JSON.stringify(upgradedProject, null, 2));
      data = upgradedProject;
    }

    // Check if it's a valid timing project structure
    if (data && typeof data === 'object' && 'segments' in data && Array.isArray(data.segments)) {
      const project = data as TimingProject;
      segments = project.segments;

      const projectDir = path.dirname(timingPath);
      const parentDir = path.dirname(projectDir);
      
      // Try to find video relative to timing file
      // Case 1: timing file is in a project folder, video is in parent folder
      let candidatePath = path.join(parentDir, project.videoName);
      
      // Case 2: timing file and video are in the same folder
      if (!fs.existsSync(candidatePath)) {
        candidatePath = path.join(projectDir, project.videoName);
      }

      if (fs.existsSync(candidatePath)) {
        videoFilePath = candidatePath;
      } else if (!videoFilePath || !fs.existsSync(videoFilePath)) {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { Video: ['mp4', 'mov', 'avi', 'mkv'] },
          title: I18n.t('config.prompts.selectVideoFile', `Pick video for project: ${project.videoName}`)
        });
        if (!selected || selected.length === 0) return;
        const selectedFile = selected[0];
        if (!selectedFile) return;
        videoFilePath = selectedFile.fsPath;
        project.videoName = path.basename(videoFilePath);
        fs.writeFileSync(timingPath, JSON.stringify(project, null, 2));
      }
    } else {
      // If it doesn't look like a timing file, warn user but still allow if they insist? 
      // Actually, if it doesn't have 'segments', it's likely not our file.
      const result = await vscode.window.showWarningMessage(
        I18n.t('errors.invalidRequest', 'This JSON file doesn\'t look like a Speechify timing project. Try opening it anyway?'),
        I18n.t('actions.ok'),
        I18n.t('actions.cancel')
      );
      if (result !== I18n.t('actions.ok')) return;
      segments = [];
      videoFilePath = videoFilePath || '';
    }

    const result = await this.openAlignmentEditor(videoFilePath, timingPath, segments);

    if (!result) {
      vscode.window.showInformationMessage(I18n.t('messages.alignmentEditorCanceled'));
      return;
    }

    const { segments: updatedSegments, action, audio: updatedAudio } = result;

    const projectContent = fs.readFileSync(timingPath, 'utf-8');
    const finalProject = JSON.parse(projectContent);
    if (finalProject && !Array.isArray(finalProject) && 'segments' in finalProject) {
      finalProject.segments = updatedSegments;
      if (updatedAudio) {
        finalProject.audio = {
          ...(finalProject.audio || {}),
          ...updatedAudio
        };
      }
      finalProject.lastModified = new Date().toISOString();
      fs.writeFileSync(timingPath, JSON.stringify(finalProject, null, 2));
    } else {
      // Legacy upgrade or simple array
      const upgraded: TimingProject = {
        version: '2.0',
        videoName: path.basename(videoFilePath),
        lastModified: new Date().toISOString(),
        segments: updatedSegments,
        ...(updatedAudio ? { audio: updatedAudio } : {})
      };
      fs.writeFileSync(timingPath, JSON.stringify(upgraded, null, 2));
    }

    if (action === 'synthesize') {
      await this.synthesizeVideoFromProject(timingPath);
    } else {
      vscode.window.showInformationMessage(I18n.t('notifications.success.alignmentSaved'));
    }
  }

  public static async synthesizeVideoFromProject(input: string | vscode.Uri): Promise<void> {
    let timingPath: string;
    let videoFilePath: string;
    const filePath = typeof input === 'string' ? input : input.fsPath;

    if (filePath.toLowerCase().endsWith('.json')) {
      timingPath = filePath;
      const content = fs.readFileSync(timingPath, 'utf-8');
      let data: unknown;
      try {
        data = JSON.parse(content);
      } catch (e) {
        throw new Error('Invalid JSON format.');
      }

      if (!data || typeof data !== 'object' || Array.isArray(data) || !('segments' in data)) {
        throw new Error('This JSON file is not a valid Speechify timing project.');
      }
      const project = data as TimingProject;
      if (!project.videoName) {
        throw new Error('Invalid project file or missing video reference.');
      }

      const projectDir = path.dirname(timingPath);
      const parentDir = path.dirname(projectDir);
      
      // Try to find video relative to timing file
      let candidateVideo = path.join(parentDir, project.videoName);
      if (!fs.existsSync(candidateVideo)) {
        candidateVideo = path.join(projectDir, project.videoName);
      }

      if (fs.existsSync(candidateVideo)) {
        videoFilePath = candidateVideo;
      } else {
        const selected = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { Video: ['mp4', 'mov', 'avi', 'mkv'] },
          title: I18n.t('config.prompts.selectVideoFile', `Pick video for project: ${project.videoName}`)
        });
        if (!selected || selected.length === 0) return;
        const selectedFile = selected[0];
        if (!selectedFile) return;
        videoFilePath = selectedFile.fsPath;

        project.videoName = path.basename(videoFilePath);
        fs.writeFileSync(timingPath, JSON.stringify(project, null, 2));
      }
    } else {
      videoFilePath = filePath;
      const projectDir = this.getVisionProjectDir(videoFilePath);
      timingPath = path.join(projectDir, 'timing.json');
      if (!fs.existsSync(timingPath)) {
        throw new Error(I18n.t('errors.alignmentTimingNotFound'));
      }
    }

    const result = await this.convertToVideoWithVision('', videoFilePath, {
      startStep: PipelineStep.SSML,
      forceRefine: false,
      openAlignmentEditor: false,
      timingPath,
      renderOverrides: { autoTrimVideo: true }
    });

    if (result.success && result.videoOutputPath) {
      const action = await vscode.window.showInformationMessage(
        I18n.t('notifications.success.videoGenerated', result.videoOutputPath),
        I18n.t('actions.showInExplorer'),
        I18n.t('actions.openFile')
      );
      if (action === I18n.t('actions.showInExplorer')) {
        await AudioUtils.showInExplorer(result.videoOutputPath);
      } else if (action === I18n.t('actions.openFile')) {
        await AudioUtils.openAudioFile(result.videoOutputPath);
      }
    }
  }

  private static async openAlignmentEditor(
    videoFilePath: string,
    timingPath: string,
    segments: TimingSegment[]
  ): Promise<{ segments: TimingSegment[]; action: string; audio?: AlignmentResult['audio'] } | null> {
    const context = this.extensionContext;
    if (!context) {
      vscode.window.showErrorMessage(I18n.t('errors.alignmentEditorUnavailable'));
      return null;
    }

    // Read current audio config from timing file
    let audioConfig: TimingAudioConfig | undefined;
    if (fs.existsSync(timingPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
        audioConfig = this.extractAudioConfig(data);
      } catch {
        // ignore
      }
    }

    const result = await AlignmentEditor.open(context, videoFilePath, segments, {
      autoSavePath: timingPath,
      ...(audioConfig ? { 
        audio: {
          ...(audioConfig.mode ? { mode: audioConfig.mode } : {}),
          ...(audioConfig.originalGainDb !== undefined ? { originalGainDb: audioConfig.originalGainDb } : {})
        }
      } : {})
    });

    if (!result) {
      return null;
    }

    return result;
  }

  private static getVisionProjectDir(videoFilePath: string): string {
    const outputDir = path.dirname(videoFilePath);
    const projectName = path.basename(videoFilePath, path.extname(videoFilePath));
    return path.join(outputDir, `${projectName}_vision_project`);
  }

  private static extractAudioConfig(data: unknown): TimingAudioConfig | undefined {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return undefined;
    }
    if (!('audio' in data)) {
      return undefined;
    }
    const candidate = (data as { audio?: unknown }).audio;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return undefined;
    }
    return candidate as TimingAudioConfig;
  }

  private static async refineSegmentsWithCalibration(
    analyzer: VideoAnalyzer,
    segments: TimingSegment[],
    videoFilePath: string,
    fallbackText: string,
    visionConfig: { apiKey?: string; endpoint?: string; deployment: string; refinementDeployment?: string },
    azureConfig: AzureConfig,
    voiceSettings: VoiceSettings
  ): Promise<TimingSegment[]> {
    const duration = await analyzer.getVideoDuration(videoFilePath);

    let wordsPerSecond = 2.5;
    try {
      const calibrationText = segments[0]?.content.substring(0, 100) || fallbackText.substring(0, 100);
      const { boundaries } = await AzureSpeechService.synthesizeWithBoundaries(
        calibrationText,
        voiceSettings,
        azureConfig
      );

      const lastBoundary = boundaries[boundaries.length - 1];
      if (lastBoundary) {
        const actualDuration = (lastBoundary.audioOffset + lastBoundary.duration) / 1000;
        const wordCount = analyzer.countWords(calibrationText);
        if (actualDuration > 0) {
          wordsPerSecond = wordCount / actualDuration;
        }
      }
    } catch {
      // keep default
    }

    return analyzer.refineScript(
      segments,
      duration,
      visionConfig.apiKey || '',
      visionConfig.endpoint || '',
      visionConfig.refinementDeployment || visionConfig.deployment,
      wordsPerSecond
    );
  }
}

class VoiceConfigurationFallback {
  public static async showConfigurationWizard(): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      I18n.t('messages.azureConfigurationRequired'),
      I18n.t('actions.configureAzure'),
      I18n.t('actions.configureVoice'),
      I18n.t('actions.cancel')
    );

    if (result === I18n.t('actions.configureAzure')) {
      await vscode.commands.executeCommand('extension.configureSpeechifyAzureSettings');
    } else if (result === I18n.t('actions.configureVoice')) {
      await vscode.commands.executeCommand('extension.configureSpeechifyVoiceSettings');
    }
  }
}
