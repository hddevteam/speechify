export const COSYVOICE_MAX_PROMPT_DURATION_SEC = 29.5;

export function buildCosyVoiceNormalizeArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    inputPath,
    '-ac',
    '1',
    '-ar',
    '16000',
    '-c:a',
    'pcm_s16le',
    '-t',
    COSYVOICE_MAX_PROMPT_DURATION_SEC.toString(),
    '-y',
    outputPath
  ];
}
