import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AzureConfig, ProcessingResult, VoiceListItem, VideoProcessingResult, VoiceSettings } from '../types';
import { ConfigManager } from '../utils/config';
import { AzureSpeechService } from '../utils/azure';
import { AudioUtils } from '../utils/audio';
import { SubtitleUtils } from '../utils/subtitle';
import { VideoMuxer } from '../utils/videoMuxer';
import { VideoAnalyzer, TimingSegment, TimingProject } from '../utils/videoAnalyzer';
import { AlignmentEditor } from '../webview/alignmentEditor';
import { I18n } from '../i18n';

/**
 * Steps for Vision Alignment Pipeline
 */
export enum PipelineStep {
  ANALYZE = 'analyze',
  REFINE = 'refine',
  SSML = 'ssml',
  SYNTHESIZE = 'synthesize',
  MUX = 'mux'
}

/**
 * Main speech synthesis service
 */
export class SpeechService {
  private static readonly MAX_CHUNK_SIZE = 8000;
  private static readonly PROCESSING_DELAY = 500; // Delay between chunks

  /**
   * Convert selected text to speech
   */
  public static async convertTextToSpeech(text: string, sourceFilePath: string): Promise<ProcessingResult> {
    try {
      // Validate configuration
      if (!ConfigManager.isConfigurationComplete()) {
        throw new Error(I18n.t('errors.configurationIncomplete'));
      }

      // Get configuration
      const azureConfig = ConfigManager.getAzureConfigForTesting();
      const voiceSettings = ConfigManager.getVoiceSettings();

      // Extract text from markdown if needed
      const cleanText = AzureSpeechService.extractTextFromMarkdown(text);
      
      if (!cleanText.trim()) {
        throw new Error(I18n.t('errors.noTextContent'));
      }

      // Split text into chunks
      const chunks = AzureSpeechService.splitTextIntoChunks(cleanText, this.MAX_CHUNK_SIZE);
      
      // Process chunks
      const result = await this.processTextChunks(chunks, sourceFilePath, voiceSettings, azureConfig);
      
      return result;
    } catch (error) {
      console.error('Speech conversion failed:', error);
      throw error;
    }
  }

  /**
   * Convert text to speech and mux into a video
   */
  public static async convertToVideo(text: string, sourceFilePath: string, videoFilePath: string): Promise<VideoProcessingResult> {
    try {
      if (!ConfigManager.isConfigurationComplete()) {
        throw new Error(I18n.t('errors.configurationIncomplete'));
      }

      const azureConfig = ConfigManager.getAzureConfigForTesting();
      const voiceSettings = ConfigManager.getVoiceSettings();
      const cleanText = AzureSpeechService.extractTextFromMarkdown(text);
      
      const audioOutputPath = AudioUtils.generateOutputPath(sourceFilePath, undefined, 1);
      const srtOutputPath = audioOutputPath.replace(/\.mp3$/, '.srt');
      const videoOutputPath = audioOutputPath.replace(/\.mp3$/, '_speechify.mp4');

      // 1. Synthesize with boundaries
      const { audioBuffer, boundaries } = await AzureSpeechService.synthesizeWithBoundaries(
        cleanText,
        voiceSettings,
        azureConfig
      );

      // 2. Save Audio
      await AudioUtils.saveAudioFile(audioBuffer, audioOutputPath);

      // 3. Save Subtitles
      const srtContent = SubtitleUtils.generateSRT(boundaries);
      await SubtitleUtils.saveSRTFile(srtContent, srtOutputPath);

      // 4. Mux Video
      const finalVideoPath = await VideoMuxer.muxVideo(
        videoFilePath,
        audioOutputPath,
        srtOutputPath,
        videoOutputPath
      );

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

  /**
   * Convert text to speech and sync with video using AI Vision analysis
   * Supports multi-step processing and refinement to avoid audio overlap
   */
  public static async convertToVideoWithVision(
    text: string, 
    _sourceFilePath: string, 
    videoFilePath: string,
    options: {
      startStep?: PipelineStep;
      forceRefine?: boolean;
      openAlignmentEditor?: boolean;
    } = {}
  ): Promise<VideoProcessingResult> {
    try {
      if (!ConfigManager.isConfigurationComplete()) {
        throw new Error(I18n.t('errors.configurationIncomplete'));
      }

      const visionConfig = ConfigManager.getVisionConfig();
      if (!visionConfig.apiKey || !visionConfig.endpoint) {
        throw new Error('Vision API configuration incomplete. Please set visionApiKey and visionEndpoint in settings.');
      }

      const azureConfig = ConfigManager.getAzureConfigForTesting();
      const voiceSettings = ConfigManager.getVoiceSettings();
      const cleanText = AzureSpeechService.extractTextFromMarkdown(text);
      
      const analyzer = new VideoAnalyzer();
      
      // Setup Project Directory for intermediate products
      const outputDir = path.dirname(videoFilePath);
      const projectName = path.basename(videoFilePath, path.extname(videoFilePath));
      const projectDir = path.join(outputDir, `${projectName}_vision_project`);
      if (!fs.existsSync(projectDir)) {
          fs.mkdirSync(projectDir, { recursive: true });
      }

      const timingPath = path.join(projectDir, 'timing.json');
      const ssmlDir = path.join(projectDir, 'ssml');
      const audioDir = path.join(projectDir, 'audio');
      const boundariesDir = path.join(projectDir, 'boundaries');

      [ssmlDir, audioDir, boundariesDir].forEach(dir => {
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      });

      let segments: TimingSegment[] = [];

      const saveProject = (segs: TimingSegment[]) => {
          const project: TimingProject = {
              version: '2.0',
              videoName: path.basename(videoFilePath),
              lastModified: new Date().toISOString(),
              segments: segs
          };
          fs.writeFileSync(timingPath, JSON.stringify(project, null, 2));
      };

      // --- STEP 1: ANALYZE ---
      if (!options.startStep || options.startStep === PipelineStep.ANALYZE) {
          console.log('[Pipeline] Step 1: Analyzing Timing...');
          const totalDuration = await analyzer.getVideoDuration(videoFilePath);
          const frames = await analyzer.extractFrames(videoFilePath, 10);
          const timingResult = await analyzer.analyzeTiming(
            frames, 
            cleanText, 
            totalDuration,
            visionConfig.apiKey, 
            visionConfig.endpoint, 
            visionConfig.deployment
          );
          segments = timingResult.segments;
          saveProject(segments);
      } else {
          console.log('[Pipeline] Skipping Step 1, loading timing.json');
          if (fs.existsSync(timingPath)) {
            const data = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
            segments = Array.isArray(data) ? data : data.segments;
          }
      }

      const shouldOpenEditor = options.openAlignmentEditor !== false &&
        (!options.startStep || options.startStep === PipelineStep.ANALYZE);

      if (shouldOpenEditor) {
        const editedSegments = await this.openAlignmentEditor(
          videoFilePath,
          timingPath,
          segments
        );

        if (!editedSegments) {
          throw new Error(I18n.t('errors.alignmentEditorCanceled'));
        }

        segments = editedSegments;
      }

      // --- STEP 2: REFINE ---
      const shouldRefine = options.forceRefine || 
                        (!options.startStep) || 
                        (options.startStep === PipelineStep.ANALYZE) ||
                        (options.startStep === PipelineStep.REFINE);

      if (shouldRefine) {
          console.log('[Pipeline] Step 2: Refining Script...');
          segments = await this.refineSegmentsWithCalibration(
          analyzer,
          segments,
          videoFilePath,
          cleanText,
          visionConfig,
          azureConfig,
          voiceSettings
          );
          saveProject(segments);
      } else {
          console.log('[Pipeline] Skipping Step 2, loading timing.json');
          const data = JSON.parse(fs.readFileSync(timingPath, 'utf-8'));
          segments = Array.isArray(data) ? data : data.segments;
      }

      // --- STEP 3: GENERATE SSML ---
      if (!options.startStep || 
          [PipelineStep.ANALYZE, PipelineStep.REFINE, PipelineStep.SSML].includes(options.startStep)) {
          console.log('[Pipeline] Step 3: Generating SSML...');
          for (let i = 0; i < segments.length; i++) {
              const seg = segments[i];
              if (!seg) continue;
              const content = seg.adjustedContent || seg.content;
              const ssml = AzureSpeechService.createSSML(content, voiceSettings);
              fs.writeFileSync(path.join(ssmlDir, `seg_${i}.ssml`), ssml);
          }
      }

      // --- STEP 4: SYNTHESIZE ---
      const allBoundaries: any[] = [];
      if (!options.startStep || 
          [PipelineStep.ANALYZE, PipelineStep.REFINE, PipelineStep.SSML, PipelineStep.SYNTHESIZE].includes(options.startStep)) {
          console.log(`[Pipeline] Step 4: Synthesizing ${segments.length} segments...`);
          
          for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            if (!seg) continue;
            // We use the adjusted content but recreate SSML if needed, or just use the saved file
            const startTimeMs = seg.startTime * 1000;
            
            console.log(`Synthesizing segment ${i+1}/${segments.length}: ${seg.title}`);
            
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
            
            const shiftedBoundaries = boundaries.map(b => ({
              ...b,
              audioOffset: b.audioOffset + startTimeMs
            }));
            allBoundaries.push(...shiftedBoundaries);
          }
      } else {
          console.log('[Pipeline] Skipping Step 4, loading audio and boundaries');
          for (let i = 0; i < segments.length; i++) {
              const seg = segments[i];
              if (!seg) continue;
              seg.audioPath = path.join(audioDir, `seg_${i}.mp3`);
              const boundaries = JSON.parse(fs.readFileSync(path.join(boundariesDir, `seg_${i}.json`), 'utf-8'));
              const startTimeMs = seg.startTime * 1000;
              const shiftedBoundaries = boundaries.map((b: any) => ({
                ...b,
                audioOffset: b.audioOffset + startTimeMs
              }));
              allBoundaries.push(...shiftedBoundaries);
          }
      }

      // --- STEP 5: MUX ---
      console.log('[Pipeline] Step 5: Final Muxing...');
      const mergedAudioPath = path.join(projectDir, `merged_final.mp3`);
      await this.mergeAudioWithOffsets(segments, mergedAudioPath);

      const srtOutputPath = path.join(projectDir, `final.srt`);
      const srtContent = SubtitleUtils.generateSRT(allBoundaries);
      await SubtitleUtils.saveSRTFile(srtContent, srtOutputPath);

      const videoOutputPath = path.join(outputDir, `${projectName}_refined_vision.mp4`);
      const finalVideoPath = await VideoMuxer.muxVideo(
        videoFilePath,
        mergedAudioPath,
        srtOutputPath,
        videoOutputPath
      );

      return {
        success: true,
        processedChunks: segments.length,
        totalChunks: segments.length,
        outputPaths: [mergedAudioPath, srtOutputPath],
        videoOutputPath: finalVideoPath,
        wordBoundaries: allBoundaries,
        errors: []
      };
    } catch (error) {
      console.error('Video conversion with vision failed:', error);
      throw error;
    }
  }

  /**
   * Merge multiple audio files at specific start times using FFmpeg
   */
  private static async mergeAudioWithOffsets(segments: any[], outputPath: string): Promise<void> {
    // Escape single quotes for labels and filter syntax
    const inputs = segments.map((s) => `-i "${s.audioPath}"`).join(' ');
    
    // Build amix filter with adelay
    // [0:a]adelay=1000|1000[a0]; [1:a]adelay=5000|5000[a1]; [a0][a1]amix=inputs=2
    const delays = segments.map((s, i) => `[${i}:a]adelay=${s.startTime * 1000}|${s.startTime * 1000}[a${i}]`).join('; ');
    const mixInput = segments.map((_, i) => `[a${i}]`).join('');
    const mix = `${delays}; ${mixInput}amix=inputs=${segments.length}:dropout_transition=0:normalize=0`;
    
    const command = `ffmpeg -y ${inputs} -filter_complex "${mix}" "${outputPath}"`;
    
    console.log('Merging audio with command:', command);
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    await execAsync(command);
  }

  /**
   * Process text chunks into audio files
   */
  private static async processTextChunks(
    chunks: string[],
    sourceFilePath: string,
    voiceSettings: any,
    azureConfig: any
  ): Promise<ProcessingResult> {
    const result: ProcessingResult = {
      success: false,
      processedChunks: 0,
      totalChunks: chunks.length,
      outputPaths: [],
      errors: []
    };

    // Show progress
    const progressOptions = {
      location: vscode.ProgressLocation.Notification,
      title: I18n.t('progress.convertingToSpeech'),
      cancellable: false
    };

    await vscode.window.withProgress(progressOptions, async (progress) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        
        // Update progress
        const percentage = (i / chunks.length) * 100;
        progress.report({
          message: I18n.t('progress.processingChunk', (i + 1).toString(), chunks.length.toString()),
          increment: percentage
        });

        try {
          const outputPath = AudioUtils.generateOutputPath(
            sourceFilePath,
            chunks.length > 1 ? i : undefined,
            chunks.length
          );

          // Synthesize speech
          const audioBuffer = await AzureSpeechService.synthesizeSpeech(
            chunk,
            voiceSettings,
            azureConfig
          );

          // Save audio file
          await AudioUtils.saveAudioFile(audioBuffer, outputPath);

          result.outputPaths.push(outputPath);
          result.processedChunks++;

          // Add delay between chunks to avoid rate limiting
          if (i < chunks.length - 1) {
            await this.delay(this.PROCESSING_DELAY);
          }
        } catch (error) {
          const errorMessage = `Chunk ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          result.errors.push(errorMessage);
          console.error(`Failed to process chunk ${i + 1}:`, error);
        }
      }
    });

    result.success = result.processedChunks > 0;
    return result;
  }

  /**
   * Extension context for file access
   */
  private static extensionContext: vscode.ExtensionContext | null = null;

  /**
   * Set extension context
   */
  public static setExtensionContext(context: vscode.ExtensionContext): void {
    this.extensionContext = context;
  }

  /**
   * Open the alignment editor and return updated segments
   */
  public static async openAlignmentEditorForVideo(videoFilePath: string): Promise<void> {
    if (!ConfigManager.isConfigurationComplete()) {
      await SpeechService.showConfigurationWizard();
      return;
    }

    const projectDir = this.getVisionProjectDir(videoFilePath);
    const timingPath = path.join(projectDir, 'timing.json');

    if (!fs.existsSync(timingPath)) {
      vscode.window.showErrorMessage(I18n.t('errors.alignmentTimingNotFound'));
      return;
    }

    const content = fs.readFileSync(timingPath, 'utf-8');
    let data = JSON.parse(content);
    let segments: TimingSegment[];
    let targetVideoPath = videoFilePath;

    // Upgrade to TimingProject structure if it's a legacy array
    if (Array.isArray(data)) {
        console.log(`[Project] Upgrading legacy timing.json to TimingProject format in ${timingPath}`);
        const upgradedProject: TimingProject = {
            version: '2.0',
            videoName: path.basename(videoFilePath),
            lastModified: new Date().toISOString(),
            segments: data
        };
        fs.writeFileSync(timingPath, JSON.stringify(upgradedProject, null, 2));
        data = upgradedProject;
    }

    // Handle TimingProject structure
    if (data && typeof data === 'object' && 'segments' in data) {
        const project = data as TimingProject;
        segments = project.segments;
        // Verify video connection
        const candidatePath = path.join(path.dirname(projectDir), project.videoName);
        if (fs.existsSync(candidatePath)) {
            targetVideoPath = candidatePath;
        } else if (!fs.existsSync(videoFilePath)) {
            // Need user to pick
            const selected = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                filters: { 'Video': ['mp4', 'mov', 'avi', 'mkv'] },
                title: `Pick video for project: ${project.videoName}`
            });
            if (!selected || selected.length === 0) return;
            targetVideoPath = selected[0]!.fsPath;
            // Update mapping inside project
            project.videoName = path.basename(targetVideoPath);
            fs.writeFileSync(timingPath, JSON.stringify(project, null, 2));
        }
    } else {
        // Fallback for unexpected data format
        segments = Array.isArray(data) ? data : [];
    }

    const updatedSegments = await this.openAlignmentEditor(
      targetVideoPath,
      timingPath,
      segments
    );

    if (!updatedSegments) {
      vscode.window.showInformationMessage(I18n.t('messages.alignmentEditorCanceled'));
      return;
    }

    const analyzer = new VideoAnalyzer();
    const visionConfig = ConfigManager.getVisionConfig();
    if (!visionConfig.apiKey || !visionConfig.endpoint) {
      vscode.window.showErrorMessage(I18n.t('errors.visionConfigurationIncomplete'));
      return;
    }
    const azureConfig = ConfigManager.getAzureConfigForTesting();
    const voiceSettings = ConfigManager.getVoiceSettings();
    const segmentsToRefine = updatedSegments as TimingSegment[];
    let firstContent = '';
    if (segmentsToRefine.length > 0) {
      const firstSeg = segmentsToRefine[0];
      if (firstSeg) {
        firstContent = firstSeg.content || '';
      }
    }

    const refinedSegments = await this.refineSegmentsWithCalibration(
      analyzer,
      segmentsToRefine,
      targetVideoPath,
      firstContent,
      visionConfig,
      azureConfig,
      voiceSettings
    );

    // Always save in Project format (already upgraded at start)
    const finalContent = fs.readFileSync(timingPath, 'utf-8');
    const finalProject = JSON.parse(finalContent);
    if (finalProject && !Array.isArray(finalProject) && 'segments' in finalProject) {
        finalProject.segments = refinedSegments;
        finalProject.lastModified = new Date().toISOString();
        fs.writeFileSync(timingPath, JSON.stringify(finalProject, null, 2));
    } else {
        // Fallback for safety
        fs.writeFileSync(timingPath, JSON.stringify(refinedSegments, null, 2));
    }
    vscode.window.showInformationMessage(I18n.t('notifications.success.alignmentSaved'));
  }

  private static async openAlignmentEditor(
    videoFilePath: string,
    timingPath: string,
    segments: TimingSegment[]
  ): Promise<TimingSegment[] | null> {
    const context = this.extensionContext;
    if (!context) {
      vscode.window.showErrorMessage(I18n.t('errors.alignmentEditorUnavailable'));
      return null;
    }

    const updatedSegments = await AlignmentEditor.open(
      context,
      videoFilePath,
      segments,
      { 
        autoSavePath: timingPath 
      }
    );

    if (!updatedSegments) {
      return null;
    }

    // Wrap the result back into the project structure if it exists
    const content = fs.readFileSync(timingPath, 'utf-8');
    const currentData = JSON.parse(content);
    if (currentData && !Array.isArray(currentData) && 'segments' in currentData) {
        const project = currentData as any;
        project.segments = updatedSegments;
        project.lastModified = new Date().toISOString();
        fs.writeFileSync(timingPath, JSON.stringify(project, null, 2));
    } else {
        fs.writeFileSync(timingPath, JSON.stringify(updatedSegments, null, 2));
    }

    return updatedSegments;
  }

  private static getVisionProjectDir(videoFilePath: string): string {
    const outputDir = path.dirname(videoFilePath);
    const projectName = path.basename(videoFilePath, path.extname(videoFilePath));
    return path.join(outputDir, `${projectName}_vision_project`);
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

    // Calibration: Synthesize a sample to get actual WPS
    let wordsPerSecond = 2.5; // Default
    try {
      console.log('[Pipeline] Calibrating Words Per Second...');
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
          console.log(`[Pipeline] Calibrated WPS: ${wordsPerSecond.toFixed(2)} (Words: ${wordCount}, Time: ${actualDuration.toFixed(2)}s)`);
        }
      }
    } catch (calibError) {
      console.warn('[Pipeline] Calibration failed, using default WPS 2.5', calibError);
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

  /**
   * Get voice list from configuration
   */
  public static getVoiceList(): VoiceListItem[] {
    try {
      const fs = require('fs');
      const path = require('path');
      
      // Try multiple possible paths for voice-list.json
      const possiblePaths = [
        // Extension context path (for installed extension)
        this.extensionContext ? path.join(this.extensionContext.extensionPath, 'voice-list.json') : null,
        // Development path (for debugging)
        path.join(__dirname, '../../voice-list.json'),
        // Packaged path (alternative)
        path.join(__dirname, '../voice-list.json'),
        // Root path
        path.join(__dirname, 'voice-list.json')
      ].filter(p => p !== null);
      
      for (const voiceListPath of possiblePaths) {
        if (fs.existsSync(voiceListPath)) {
          const data = fs.readFileSync(voiceListPath, 'utf-8');
          console.log(`Voice list loaded from: ${voiceListPath}`);
          return JSON.parse(data) as VoiceListItem[];
        }
      }
      
      console.error('Voice list file not found in any of the expected locations:', possiblePaths);
    } catch (error) {
      console.error('Failed to load voice list:', error);
    }
    
    return [];
  }

  /**
   * Filter voice list by attribute
   */
  public static filterVoiceList(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem,
    value?: string
  ): VoiceListItem[] {
    if (!value) {
      return voiceList;
    }
    
    return voiceList.filter(item => item[attribute] === value);
  }

  /**
   * Get unique values for voice attribute
   */
  public static getUniqueValues(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem
  ): string[] {
    const values = voiceList.map(item => item[attribute]).filter((value): value is string => Boolean(value));
    return [...new Set(values)];
  }

  /**
   * Create quick pick items for voice selection
   */
  public static createVoiceQuickPickItems(
    voiceList: VoiceListItem[],
    attribute: keyof VoiceListItem,
    defaultValue?: string
  ): vscode.QuickPickItem[] {
    const uniqueValues = this.getUniqueValues(voiceList, attribute);
    
    return uniqueValues.map(value => {
      const item: vscode.QuickPickItem = {
        label: value,
        picked: value === defaultValue
      };
      
      if (value === defaultValue) {
        item.description = I18n.t('settings.current');
      }
      
      return item;
    });
  }

  /**
   * Show configuration wizard
   */
  public static async showConfigurationWizard(): Promise<void> {
    const result = await vscode.window.showInformationMessage(
      I18n.t('messages.azureConfigurationRequired'),
      I18n.t('actions.configureAzure'),
      I18n.t('actions.configureVoice'),
      I18n.t('actions.cancel')
    );

    switch (result) {
      case I18n.t('actions.configureAzure'):
        await this.configureAzureSettings();
        break;
      case I18n.t('actions.configureVoice'):
        await this.configureVoiceSettings();
        break;
    }
  }

  /**
   * Configure Azure Speech Services settings
   */
  public static async configureAzureSettings(): Promise<void> {
    const subscriptionKey = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.subscriptionKey'),
      password: true,
      placeHolder: I18n.t('config.prompts.subscriptionKeyPlaceholder')
    });

    if (subscriptionKey) {
      await ConfigManager.updateWorkspaceConfig('azureSpeechServicesKey', subscriptionKey);
    }

    const region = await vscode.window.showInputBox({
      prompt: I18n.t('config.prompts.region'),
      value: 'eastus',
      placeHolder: I18n.t('config.prompts.regionPlaceholder')
    });

    if (region) {
      await ConfigManager.updateWorkspaceConfig('speechServicesRegion', region);
    }

    vscode.window.showInformationMessage(I18n.t('notifications.success.azureSettingsUpdated'));
  }

  /**
   * Configure voice settings with step-by-step selection
   */
  public static async configureVoiceSettings(): Promise<void> {
    const voiceList = this.getVoiceList();
    
    if (voiceList.length === 0) {
      vscode.window.showErrorMessage(I18n.t('errors.voiceListNotAvailable'));
      return;
    }

    try {
      // Step 1: Select Locale (Language)
      const selectedLocale = await this.selectLocale(voiceList);
      if (!selectedLocale) return;

      // Step 2: Select Voice (with gender indication)
      const selectedVoice = await this.selectVoiceByLocale(voiceList, selectedLocale);
      if (!selectedVoice) return;

      // Step 3: Select Style (if available)
      const selectedStyle = await this.selectVoiceStyle(selectedVoice);
      if (!selectedStyle) return;

      // Update configuration
      await ConfigManager.updateWorkspaceConfig('voiceName', selectedVoice.ShortName);
      await ConfigManager.updateWorkspaceConfig('voiceGender', selectedVoice.Gender);
      await ConfigManager.updateWorkspaceConfig('voiceStyle', selectedStyle);

      vscode.window.showInformationMessage(
        I18n.t('notifications.success.voiceSettingsUpdated') + 
        ` ${selectedVoice.DisplayName} (${selectedVoice.Gender}, ${selectedStyle})`
      );
    } catch (error) {
      vscode.window.showErrorMessage(I18n.t('errors.voiceConfigurationFailed'));
      console.error('Voice configuration failed:', error);
    }
  }

  /**
   * Step 1: Select language/locale
   */
  private static async selectLocale(voiceList: VoiceListItem[]): Promise<string | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const currentVoice = voiceList.find(v => v.ShortName === currentSettings.name);
    const currentLocaleName = currentVoice?.LocaleName;
    
    const uniqueLocales = this.getUniqueValues(voiceList, 'LocaleName');
    const localeItems = uniqueLocales.map(localeName => {
      const voice = voiceList.find(v => v.LocaleName === localeName);
      return {
        label: localeName,
        description: voice?.Locale || '',
        detail: `${voiceList.filter(v => v.LocaleName === localeName).length} voices available`
      };
    }).sort((a, b) => a.label.localeCompare(b.label));

    // Move current locale to top and mark with ★
    if (currentLocaleName) {
      const currentIndex = localeItems.findIndex(item => item.label === currentLocaleName);
      if (currentIndex !== -1) {
        const [currentItem] = localeItems.splice(currentIndex, 1);
        if (currentItem) {
          currentItem.label = `★ ${currentItem.label}`;
          localeItems.unshift(currentItem);
        }
      }
    }

    const selectedLocale = await vscode.window.showQuickPick(localeItems, {
      placeHolder: I18n.t('config.prompts.selectLanguage'),
      title: 'Step 1/3: Select Language'
    });

    // Remove ★ symbol if present
    const selectedLocaleName = selectedLocale?.label.startsWith('★ ') ? 
      selectedLocale.label.substring(2) : 
      selectedLocale?.label;

    return selectedLocaleName;
  }

  /**
   * Step 2: Select voice with gender indication
   */
  private static async selectVoiceByLocale(voiceList: VoiceListItem[], localeName: string): Promise<VoiceListItem | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const voicesForLocale = voiceList.filter(v => v.LocaleName === localeName);
    
    const voiceItems = voicesForLocale.map(voice => ({
      label: `${voice.DisplayName} ${voice.LocalName ? `(${voice.LocalName})` : ''} - ${voice.Gender}`,
      description: voice.ShortName,
      detail: voice.StyleList && voice.StyleList.length > 0 
        ? `Styles: ${voice.StyleList.join(', ')}` 
        : 'Default style only',
      voice: voice
    })).sort((a, b) => {
      // Sort by gender first, then by name
      if (a.voice.Gender !== b.voice.Gender) {
        return a.voice.Gender.localeCompare(b.voice.Gender);
      }
      return a.voice.DisplayName.localeCompare(b.voice.DisplayName);
    });

    // Move current voice to top and mark with ★
    const currentIndex = voiceItems.findIndex(item => item.voice.ShortName === currentSettings.name);
    if (currentIndex !== -1) {
      const [currentItem] = voiceItems.splice(currentIndex, 1);
      if (currentItem) {
        currentItem.label = `★ ${currentItem.label}`;
        voiceItems.unshift(currentItem);
      }
    }

    const selectedVoiceItem = await vscode.window.showQuickPick(voiceItems, {
      placeHolder: I18n.t('config.prompts.selectVoice'),
      title: `Step 2/3: Select Voice for ${localeName}`
    });

    return selectedVoiceItem?.voice;
  }

  /**
   * Step 3: Select voice style
   */
  private static async selectVoiceStyle(voice: VoiceListItem): Promise<string | undefined> {
    const currentSettings = ConfigManager.getVoiceSettings();
    const availableStyles = voice.StyleList || ['general'];
    
    if (availableStyles.length === 1) {
      // Only one style available, use it directly
      return availableStyles[0];
    }

    // Multiple styles available, let user choose
    const styleItems = availableStyles.map(style => ({
      label: style,
      description: this.getStyleDescription(style)
    }));

    // Move current style to top and mark with ★
    const currentIndex = styleItems.findIndex(item => item.label === currentSettings.style);
    if (currentIndex !== -1) {
      const [currentItem] = styleItems.splice(currentIndex, 1);
      if (currentItem) {
        currentItem.label = `★ ${currentItem.label}`;
        styleItems.unshift(currentItem);
      }
    }

    const selectedStyleItem = await vscode.window.showQuickPick(styleItems, {
      placeHolder: `Select style for ${voice.DisplayName}`,
      title: `Step 3/3: Select Voice Style`
    });

    // Remove ★ symbol if present
    const selectedStyle = selectedStyleItem?.label.startsWith('★ ') ? 
      selectedStyleItem.label.substring(2) : 
      selectedStyleItem?.label;

    return selectedStyle || 'general';
  }

  /**
   * Get friendly description for voice styles
   */
  private static getStyleDescription(style: string): string {
    const styleDescriptions: { [key: string]: string } = {
      'general': 'Default neutral style',
      'cheerful': 'Happy and upbeat',
      'sad': 'Melancholy and sorrowful', 
      'angry': 'Annoyed and angry',
      'fearful': 'Scared and nervous',
      'disgruntled': 'Contemptuous and complaining',
      'serious': 'Serious and commanding',
      'affectionate': 'Warm and affectionate',
      'gentle': 'Mild, polite and pleasant',
      'calm': 'Cool, collected and composed',
      'newscast': 'Formal and professional news style',
      'customerservice': 'Friendly customer service style',
      'assistant': 'Digital assistant style',
      'chat': 'Casual conversational style',
      'hopeful': 'Optimistic and inspiring',
      'excited': 'Energetic and enthusiastic'
    };
    
    return styleDescriptions[style] || 'Voice style';
  }

  /**
   * Quick select voice style for current voice
   */
  public static async selectVoiceStyleQuickly(): Promise<void> {
    const voiceSettings = ConfigManager.getVoiceSettings();
    const voiceList = this.getVoiceList();
    
    // Find current voice
    const currentVoice = voiceList.find(voice => voice.ShortName === voiceSettings.name);
    
    if (!currentVoice) {
      vscode.window.showErrorMessage(I18n.t('errors.currentVoiceNotFound'));
      return;
    }
    
    // Check if voice has styles
    if (!currentVoice.StyleList || currentVoice.StyleList.length === 0) {
      vscode.window.showInformationMessage(
        I18n.t('errors.voiceNoStyles', currentVoice.DisplayName)
      );
      return;
    }
    
    // Create style options with current selection at top
    const styleItems = currentVoice.StyleList.map(style => ({
      label: style,
      description: ''
    }));
    
    // Move current style to top and mark with ★
    const currentStyleIndex = styleItems.findIndex(item => item.label === voiceSettings.style);
    if (currentStyleIndex !== -1) {
      const [currentStyleItem] = styleItems.splice(currentStyleIndex, 1);
      if (currentStyleItem) {
        currentStyleItem.label = `★ ${currentStyleItem.label}`;
        styleItems.unshift(currentStyleItem);
      }
    }
    
    const selectedStyleItem = await vscode.window.showQuickPick(styleItems, {
      placeHolder: I18n.t('config.prompts.selectStyle'),
      title: `Select style for ${currentVoice.DisplayName}`
    });
    
    if (!selectedStyleItem) return;
    
    // Remove ★ symbol if present
    const selectedStyle = selectedStyleItem.label.startsWith('★ ') ? 
      selectedStyleItem.label.substring(2) : 
      selectedStyleItem.label;
    
    // Update configuration
    await ConfigManager.updateWorkspaceConfig('voiceStyle', selectedStyle);
    
    vscode.window.showInformationMessage(
      I18n.t('notifications.success.voiceStyleChanged', selectedStyle)
    );
  }

  /**
   * Select voice role for roleplay-enabled voices
   */
  public static async selectVoiceRole(): Promise<void> {
    try {
      const voiceList = await this.getVoiceList();
      if (!voiceList || voiceList.length === 0) {
        vscode.window.showErrorMessage(I18n.t('errors.voiceListNotAvailable'));
        return;
      }

      // Get current voice settings
      const voiceSettings = await ConfigManager.getVoiceSettings();
      if (!voiceSettings) {
        vscode.window.showErrorMessage(I18n.t('errors.failedToLoadVoiceSettings'));
        return;
      }

      // Find current voice
      const currentVoice = voiceList.find(voice => voice.ShortName === voiceSettings.name);
      if (!currentVoice) {
        vscode.window.showErrorMessage(I18n.t('errors.currentVoiceNotFound'));
        return;
      }

      // Check if voice has roleplay options
      if (!currentVoice.RolePlayList || currentVoice.RolePlayList.length === 0) {
        vscode.window.showInformationMessage(
          I18n.t('notifications.info.noRolesAvailable', currentVoice.DisplayName)
        );
        return;
      }

      // Create role selection items with current role marked
      const currentRole = voiceSettings.role || 'default';
      const roleItems = currentVoice.RolePlayList.map(role => ({
        label: currentRole === role ? `★ ${role}` : role,
        description: currentRole === role ? I18n.t('settings.current') : '',
        role: role
      }));

      // Show role selection
      const selectedItem = await vscode.window.showQuickPick(roleItems, {
        placeHolder: I18n.t('config.prompts.selectRole'),
        canPickMany: false
      });

      if (!selectedItem) {
        return; // User cancelled
      }

      // Update configuration
      await ConfigManager.updateWorkspaceConfig('voiceRole', selectedItem.role);

      vscode.window.showInformationMessage(
        I18n.t('notifications.success.voiceRoleChanged', selectedItem.role)
      );
    } catch (error) {
      console.error('Failed to select voice role:', error);
      vscode.window.showErrorMessage(I18n.t('errors.failedToSelectRole'));
    }
  }

  /**
   * Delay utility
   */
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
