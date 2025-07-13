import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { AudioFormat, SpeechifyError } from '../types';

/**
 * Audio file utilities
 */
export class AudioUtils {
  private static readonly SUPPORTED_FORMATS: AudioFormat[] = ['mp3', 'wav', 'ogg'];
  private static readonly DEFAULT_FORMAT: AudioFormat = 'mp3';

  /**
   * Generate output file path for audio
   */
  public static generateOutputPath(
    sourceFilePath: string,
    text: string,
    chunkIndex?: number,
    format: AudioFormat = this.DEFAULT_FORMAT
  ): string {
    const sourceDir = path.dirname(sourceFilePath);
    const sourceBaseName = path.basename(sourceFilePath, path.extname(sourceFilePath));
    
    // Create a safe filename from text
    const textPreview = this.sanitizeFileName(text.substring(0, 50));
    const chunkSuffix = chunkIndex !== undefined ? `_part${chunkIndex + 1}` : '';
    const timestamp = Date.now();
    
    const fileName = `${sourceBaseName}_speechify_${textPreview}${chunkSuffix}_${timestamp}.${format}`;
    
    return path.join(sourceDir, fileName);
  }

  /**
   * Sanitize filename to remove invalid characters
   */
  private static sanitizeFileName(text: string): string {
    return text
      .replace(/[^a-zA-Z0-9\s-_]/g, '') // Remove invalid chars
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
  }

  /**
   * Save audio buffer to file
   */
  public static async saveAudioFile(audioBuffer: Buffer, filePath: string): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write audio file
      fs.writeFileSync(filePath, audioBuffer);
    } catch (error) {
      throw this.createError('FILE_WRITE_ERROR', `Failed to save audio file: ${filePath}`, error);
    }
  }

  /**
   * Check if file exists
   */
  public static fileExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  /**
   * Get file size in bytes
   */
  public static getFileSize(filePath: string): number {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  /**
   * Format file size for display
   */
  public static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Validate audio format
   */
  public static isValidAudioFormat(format: string): format is AudioFormat {
    return this.SUPPORTED_FORMATS.includes(format as AudioFormat);
  }

  /**
   * Get audio format from file extension
   */
  public static getAudioFormatFromPath(filePath: string): AudioFormat {
    const ext = path.extname(filePath).toLowerCase().substring(1);
    return this.isValidAudioFormat(ext) ? ext : this.DEFAULT_FORMAT;
  }

  /**
   * Delete audio file
   */
  public static async deleteAudioFile(filePath: string): Promise<void> {
    try {
      if (this.fileExists(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      throw this.createError('FILE_DELETE_ERROR', `Failed to delete audio file: ${filePath}`, error);
    }
  }

  /**
   * Get audio file duration (placeholder - would need audio library)
   */
  public static async getAudioDuration(filePath: string): Promise<number> {
    // This would require an audio library like node-ffmpeg
    // For now, return estimated duration based on file size
    const fileSize = this.getFileSize(filePath);
    const estimatedDuration = fileSize / 16000; // Rough estimate for MP3
    return Math.round(estimatedDuration);
  }

  /**
   * Show audio file in explorer
   */
  public static async showInExplorer(filePath: string): Promise<void> {
    try {
      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(filePath));
    } catch (error) {
      throw this.createError('REVEAL_ERROR', `Failed to reveal file in explorer: ${filePath}`, error);
    }
  }

  /**
   * Open audio file with default application
   */
  public static async openAudioFile(filePath: string): Promise<void> {
    try {
      await vscode.env.openExternal(vscode.Uri.file(filePath));
    } catch (error) {
      throw this.createError('OPEN_ERROR', `Failed to open audio file: ${filePath}`, error);
    }
  }

  /**
   * Get relative path for display
   */
  public static getRelativePath(filePath: string): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      return path.relative(workspaceFolder.uri.fsPath, filePath);
    }
    return path.basename(filePath);
  }

  /**
   * Create structured error
   */
  private static createError(code: string, message: string, details?: any): SpeechifyError {
    return {
      code,
      message,
      details
    };
  }
}
