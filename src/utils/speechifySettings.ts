import type * as vscode from 'vscode';
import { SpeechifyConfig } from '../types';

export interface SpeechifySettingDescriptor {
  configKey: keyof SpeechifyConfig;
  settingPath: string;
  legacySettingPaths: string[];
  section: 'general' | 'azure' | 'cosyvoice' | 'vision' | 'video';
  helpLines: string[];
}

export const SPEECHIFY_SETTING_DESCRIPTORS: SpeechifySettingDescriptor[] = [
  {
    configKey: 'speechProvider',
    settingPath: 'speechify.provider',
    legacySettingPaths: ['speechify.speechProvider'],
    section: 'general',
    helpLines: ['Speech backend.', 'Options: "azure" | "cosyvoice".']
  },
  {
    configKey: 'azureSpeechServicesKey',
    settingPath: 'speechify.azure.speechServicesKey',
    legacySettingPaths: ['speechify.azureSpeechServicesKey'],
    section: 'azure',
    helpLines: ['Azure Speech subscription key.', 'Get it from Azure Portal -> Speech resource -> Keys and Endpoint.']
  },
  {
    configKey: 'speechServicesRegion',
    settingPath: 'speechify.azure.region',
    legacySettingPaths: ['speechify.speechServicesRegion'],
    section: 'azure',
    helpLines: ['Azure Speech region.', 'Examples: eastus, westus2, japaneast.']
  },
  {
    configKey: 'voiceName',
    settingPath: 'speechify.azure.voiceName',
    legacySettingPaths: ['speechify.voiceName'],
    section: 'azure',
    helpLines: [
      'Azure voice name.',
      'Chinese examples: zh-CN-YunyangNeural, zh-CN-XiaoxiaoNeural, zh-CN-YunxiNeural.',
      'English example: en-US-JennyNeural.'
    ]
  },
  {
    configKey: 'voiceGender',
    settingPath: 'speechify.azure.voiceGender',
    legacySettingPaths: ['speechify.voiceGender'],
    section: 'azure',
    helpLines: ['Voice gender hint.', 'Common values: Male, Female.']
  },
  {
    configKey: 'voiceStyle',
    settingPath: 'speechify.azure.voiceStyle',
    legacySettingPaths: ['speechify.voiceStyle'],
    section: 'azure',
    helpLines: ['Speaking style.', 'Examples: friendly, cheerful, newscast.']
  },
  {
    configKey: 'voiceRole',
    settingPath: 'speechify.azure.voiceRole',
    legacySettingPaths: ['speechify.voiceRole'],
    section: 'azure',
    helpLines: ['Optional roleplay role for supported voices.', 'Leave empty if you do not use roleplay voices.']
  },
  {
    configKey: 'cosyVoiceBaseUrl',
    settingPath: 'speechify.cosyVoice.baseUrl',
    legacySettingPaths: ['speechify.cosyVoiceBaseUrl'],
    section: 'cosyvoice',
    helpLines: ['Local CosyVoice FastAPI address.', 'Default: http://127.0.0.1:50000']
  },
  {
    configKey: 'cosyVoicePythonPath',
    settingPath: 'speechify.cosyVoice.pythonPath',
    legacySettingPaths: ['speechify.cosyVoicePythonPath'],
    section: 'cosyvoice',
    helpLines: ['Optional local Python path used for reference transcription.', 'Only fill this if auto-detection cannot find your runtime.']
  },
  {
    configKey: 'cosyVoicePromptAudioPath',
    settingPath: 'speechify.cosyVoice.promptAudioPath',
    legacySettingPaths: ['speechify.cosyVoicePromptAudioPath'],
    section: 'cosyvoice',
    helpLines: ['Reference media path for voice cloning.', 'Can be a recorded sample, an audio file, or extracted audio from a video.']
  },
  {
    configKey: 'cosyVoicePromptText',
    settingPath: 'speechify.cosyVoice.promptText',
    legacySettingPaths: ['speechify.cosyVoicePromptText'],
    section: 'cosyvoice',
    helpLines: ['Transcript for the reference media.', 'Strongly recommended. With audio + transcript Speechify uses zero-shot cloning.']
  },
  {
    configKey: 'cosyVoiceRequestTimeoutSeconds',
    settingPath: 'speechify.cosyVoice.requestTimeoutSeconds',
    legacySettingPaths: ['speechify.cosyVoiceRequestTimeoutSeconds'],
    section: 'cosyvoice',
    helpLines: ['Local request timeout in seconds.', 'Default: 300. Increase this first if local zero-shot feels slow.']
  },
  {
    configKey: 'visionApiKey',
    settingPath: 'speechify.vision.apiKey',
    legacySettingPaths: ['speechify.visionApiKey'],
    section: 'vision',
    helpLines: ['Azure OpenAI API key for AI Smart Align.', 'Get it from Azure Portal -> Azure OpenAI -> Keys and Endpoint.']
  },
  {
    configKey: 'visionEndpoint',
    settingPath: 'speechify.vision.endpoint',
    legacySettingPaths: ['speechify.visionEndpoint'],
    section: 'vision',
    helpLines: ['Azure OpenAI endpoint for AI Smart Align.', 'Example: https://<resource-name>.openai.azure.com']
  },
  {
    configKey: 'visionDeployment',
    settingPath: 'speechify.vision.deployment',
    legacySettingPaths: ['speechify.visionDeployment'],
    section: 'vision',
    helpLines: ['Model deployment used for timing analysis.', 'Recommended: gpt-5-mini for speed/cost.']
  },
  {
    configKey: 'refinementDeployment',
    settingPath: 'speechify.vision.refinementDeployment',
    legacySettingPaths: ['speechify.refinementDeployment'],
    section: 'vision',
    helpLines: ['Model deployment used for script refinement.', 'Recommended: gpt-5.2 for better rewrite quality.']
  },
  {
    configKey: 'enableTransitions',
    settingPath: 'speechify.enableTransitions',
    legacySettingPaths: [],
    section: 'video',
    helpLines: ['Whether to add transitions between video segments.', 'Options: true | false.']
  },
  {
    configKey: 'transitionType',
    settingPath: 'speechify.transitionType',
    legacySettingPaths: [],
    section: 'video',
    helpLines: ['Transition style.', 'Options: "fade" | "wipeleft" | "slideleft".']
  },
  {
    configKey: 'autoTrimVideo',
    settingPath: 'speechify.autoTrimVideo',
    legacySettingPaths: [],
    section: 'video',
    helpLines: ['Automatically trim video to match audio duration.', 'Options: true | false.']
  }
];

export const SPEECHIFY_WORKSPACE_SETTING_KEYS: Array<keyof SpeechifyConfig> = SPEECHIFY_SETTING_DESCRIPTORS.map(
  descriptor => descriptor.configKey
);

const SPEECHIFY_SETTING_DESCRIPTOR_MAP = new Map<keyof SpeechifyConfig, SpeechifySettingDescriptor>(
  SPEECHIFY_SETTING_DESCRIPTORS.map(descriptor => [descriptor.configKey, descriptor])
);

export function getSpeechifySettingDescriptor(configKey: keyof SpeechifyConfig): SpeechifySettingDescriptor {
  const descriptor = SPEECHIFY_SETTING_DESCRIPTOR_MAP.get(configKey);
  if (!descriptor) {
    throw new Error(`Unknown Speechify config key: ${String(configKey)}`);
  }

  return descriptor;
}

export function getSpeechifyPrimarySettingPaths(): string[] {
  return SPEECHIFY_SETTING_DESCRIPTORS.map(descriptor => descriptor.settingPath);
}

export function getSpeechifyPrimaryRelativeKey(configKey: keyof SpeechifyConfig): string {
  const descriptor = getSpeechifySettingDescriptor(configKey);
  return stripSpeechifyPrefix(descriptor.settingPath);
}

export function getSpeechifyAllSettingPaths(): string[] {
  return SPEECHIFY_SETTING_DESCRIPTORS.flatMap(descriptor => [descriptor.settingPath, ...descriptor.legacySettingPaths]);
}

export function readSpeechifySettingValue<T>(
  config: vscode.WorkspaceConfiguration,
  configKey: keyof SpeechifyConfig,
  defaultValue: T
): T {
  const descriptor = getSpeechifySettingDescriptor(configKey);
  const primaryRelativeKey = stripSpeechifyPrefix(descriptor.settingPath);

  if (hasConfiguredValue(config.inspect(primaryRelativeKey))) {
    return config.get<T>(primaryRelativeKey, defaultValue);
  }

  for (const legacyPath of descriptor.legacySettingPaths) {
    const legacyRelativeKey = stripSpeechifyPrefix(legacyPath);
    if (hasConfiguredValue(config.inspect(legacyRelativeKey))) {
      return config.get<T>(legacyRelativeKey, defaultValue);
    }
  }

  return config.get<T>(primaryRelativeKey, defaultValue);
}

export function buildSpeechifyWorkspaceSeedEntries(
  effectiveValues: SpeechifyConfig,
  workspaceValues: Partial<SpeechifyConfig>
): Array<[keyof SpeechifyConfig, SpeechifyConfig[keyof SpeechifyConfig]]> {
  const entries: Array<[keyof SpeechifyConfig, SpeechifyConfig[keyof SpeechifyConfig]]> = [];

  for (const descriptor of SPEECHIFY_SETTING_DESCRIPTORS) {
    const key = descriptor.configKey;
    if (workspaceValues[key] !== undefined) {
      continue;
    }

    const value = effectiveValues[key];
    if (value === undefined) {
      continue;
    }

    entries.push([key, value]);
  }

  return entries;
}

export function upsertSpeechifyWorkspaceSettingsJsonText(
  settingsJsonText: string,
  effectiveValues: SpeechifyConfig
): string {
  const settingsObject = parseSettingsJsoncText(settingsJsonText);

  for (const descriptor of SPEECHIFY_SETTING_DESCRIPTORS) {
    const currentValue = readWorkspaceValueFromSettingsObject(settingsObject, descriptor);
    if (currentValue === undefined) {
      const effectiveValue = effectiveValues[descriptor.configKey];
      if (effectiveValue !== undefined) {
        settingsObject[descriptor.settingPath] = effectiveValue;
      }
    } else if (!Object.prototype.hasOwnProperty.call(settingsObject, descriptor.settingPath)) {
      settingsObject[descriptor.settingPath] = currentValue;
    }

    for (const legacySettingPath of descriptor.legacySettingPaths) {
      delete settingsObject[legacySettingPath];
    }
  }

  return stringifySettingsJsonc(settingsObject);
}

export function parseSettingsJsoncText(input: string): Record<string, unknown> {
  return parseJsoncObject(input);
}

function readWorkspaceValueFromSettingsObject(
  settingsObject: Record<string, unknown>,
  descriptor: SpeechifySettingDescriptor
): SpeechifyConfig[keyof SpeechifyConfig] | undefined {
  if (Object.prototype.hasOwnProperty.call(settingsObject, descriptor.settingPath)) {
    return settingsObject[descriptor.settingPath] as SpeechifyConfig[keyof SpeechifyConfig];
  }

  for (const legacySettingPath of descriptor.legacySettingPaths) {
    if (Object.prototype.hasOwnProperty.call(settingsObject, legacySettingPath)) {
      return settingsObject[legacySettingPath] as SpeechifyConfig[keyof SpeechifyConfig];
    }
  }

  return undefined;
}

function hasConfiguredValue(
  inspection: { workspaceFolderValue?: unknown; workspaceValue?: unknown; globalValue?: unknown } | undefined
): boolean {
  return inspection?.workspaceFolderValue !== undefined ||
    inspection?.workspaceValue !== undefined ||
    inspection?.globalValue !== undefined;
}

function stripSpeechifyPrefix(settingPath: string): string {
  return settingPath.replace(/^speechify\./, '');
}

function parseJsoncObject(input: string): Record<string, unknown> {
  const normalized = stripTrailingCommas(stripJsonComments(input)).trim();
  if (!normalized) {
    return {};
  }

  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new Error('Workspace settings.json must contain a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function stringifySettingsJsonc(value: Record<string, unknown>): string {
  const entries = Object.entries(value);
  const nonSpeechifyEntries = entries.filter(([key]) => !key.startsWith('speechify.'));
  const speechifyValueMap = new Map(entries.filter(([key]) => key.startsWith('speechify.')));
  const lines: string[] = ['{'];
  const currentProvider = normalizeProviderValue(speechifyValueMap.get('speechify.provider'));
  const orderedDescriptors = orderDescriptorsForProvider(currentProvider);

  const appendEntry = (key: string, entryValue: unknown, trailingComma: boolean): void => {
    lines.push(`  ${JSON.stringify(key)}: ${JSON.stringify(entryValue)},`.replace(/,$/, trailingComma ? ',' : ''));
  };

  if (nonSpeechifyEntries.length > 0) {
    nonSpeechifyEntries.forEach(([key, entryValue], index) => {
      const hasMore = index < nonSpeechifyEntries.length - 1 || SPEECHIFY_SETTING_DESCRIPTORS.length > 0;
      appendEntry(key, entryValue, hasMore);
    });
    lines.push('');
  }

  lines.push('  // Speechify quick start:');
  lines.push('  // 1. Set speechify.provider to "azure" or "cosyvoice".');
  lines.push(`  // 2. Current provider: ${currentProvider}. Read that section first.`);
  lines.push('  // 3. Fill only the provider section you actually use.');
  lines.push('  // 4. For local voice cloning, reference media can come from recording, audio, or video.');
  lines.push('');

  const sectionHeaders: Record<SpeechifySettingDescriptor['section'], string> = {
    general: 'General',
    azure: 'Azure voiceover',
    cosyvoice: 'Local CosyVoice voice cloning',
    vision: 'Azure Vision / AI Smart Align',
    video: 'Video export'
  };

  orderedDescriptors.forEach((descriptor, index) => {
    const previous = orderedDescriptors[index - 1];
    if (!previous || previous.section !== descriptor.section) {
      lines.push(`  // ${sectionHeaders[descriptor.section]}`);
      if (isPrimarySectionForProvider(descriptor.section, currentProvider)) {
        lines.push('  // Start here for your current provider.');
      } else if (isSecondarySectionForProvider(descriptor.section, currentProvider)) {
        lines.push('  // Optional unless you use AI Smart Align or video export.');
      }
    }

    for (const helpLine of descriptor.helpLines) {
      lines.push(`  // ${helpLine}`);
    }

    const valueForKey = speechifyValueMap.get(descriptor.settingPath);
    appendEntry(
      descriptor.settingPath,
      valueForKey,
      index < orderedDescriptors.length - 1
    );
  });

  lines.push('}');
  lines.push('');
  return lines.join('\n');
}

function normalizeProviderValue(value: unknown): 'azure' | 'cosyvoice' {
  return value === 'cosyvoice' ? 'cosyvoice' : 'azure';
}

function orderDescriptorsForProvider(provider: 'azure' | 'cosyvoice'): SpeechifySettingDescriptor[] {
  const sectionOrder: SpeechifySettingDescriptor['section'][] = provider === 'cosyvoice'
    ? ['general', 'cosyvoice', 'azure', 'vision', 'video']
    : ['general', 'azure', 'vision', 'cosyvoice', 'video'];

  return sectionOrder.flatMap(section =>
    SPEECHIFY_SETTING_DESCRIPTORS.filter(descriptor => descriptor.section === section)
  );
}

function isPrimarySectionForProvider(
  section: SpeechifySettingDescriptor['section'],
  provider: 'azure' | 'cosyvoice'
): boolean {
  return (provider === 'azure' && section === 'azure') || (provider === 'cosyvoice' && section === 'cosyvoice');
}

function isSecondarySectionForProvider(
  section: SpeechifySettingDescriptor['section'],
  provider: 'azure' | 'cosyvoice'
): boolean {
  if (provider === 'azure') {
    return section === 'vision' || section === 'video';
  }

  return section === 'video' || section === 'vision';
}

function stripJsonComments(input: string): string {
  let result = '';
  let inString = false;
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const nextChar = input[index + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
        result += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (inString) {
      result += char;

      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === '/' && nextChar === '/') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    result += char;
  }

  return result;
}

function stripTrailingCommas(input: string): string {
  let result = '';
  let inString = false;
  let escaping = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];

    if (inString) {
      result += char;

      if (escaping) {
        escaping = false;
      } else if (char === '\\') {
        escaping = true;
      } else if (char === '"') {
        inString = false;
      }

      continue;
    }

    if (char === '"') {
      inString = true;
      result += char;
      continue;
    }

    if (char === ',') {
      let lookahead = index + 1;
      while (lookahead < input.length) {
        const lookaheadChar = input[lookahead];
        if (!lookaheadChar || !/\s/.test(lookaheadChar)) {
          break;
        }
        lookahead += 1;
      }

      if (input[lookahead] === '}' || input[lookahead] === ']') {
        continue;
      }
    }

    result += char;
  }

  return result;
}
