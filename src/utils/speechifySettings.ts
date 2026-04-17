import type * as vscode from 'vscode';
import { SpeechifyConfig } from '../types';

export interface SpeechifySettingDescriptor {
  configKey: keyof SpeechifyConfig;
  settingPath: string;
  legacySettingPaths: string[];
}

export const SPEECHIFY_SETTING_DESCRIPTORS: SpeechifySettingDescriptor[] = [
  { configKey: 'speechProvider', settingPath: 'speechify.provider', legacySettingPaths: ['speechify.speechProvider'] },
  { configKey: 'azureSpeechServicesKey', settingPath: 'speechify.azure.speechServicesKey', legacySettingPaths: ['speechify.azureSpeechServicesKey'] },
  { configKey: 'speechServicesRegion', settingPath: 'speechify.azure.region', legacySettingPaths: ['speechify.speechServicesRegion'] },
  { configKey: 'voiceName', settingPath: 'speechify.azure.voiceName', legacySettingPaths: ['speechify.voiceName'] },
  { configKey: 'voiceGender', settingPath: 'speechify.azure.voiceGender', legacySettingPaths: ['speechify.voiceGender'] },
  { configKey: 'voiceStyle', settingPath: 'speechify.azure.voiceStyle', legacySettingPaths: ['speechify.voiceStyle'] },
  { configKey: 'voiceRole', settingPath: 'speechify.azure.voiceRole', legacySettingPaths: ['speechify.voiceRole'] },
  { configKey: 'cosyVoiceBaseUrl', settingPath: 'speechify.cosyVoice.baseUrl', legacySettingPaths: ['speechify.cosyVoiceBaseUrl'] },
  { configKey: 'cosyVoicePythonPath', settingPath: 'speechify.cosyVoice.pythonPath', legacySettingPaths: ['speechify.cosyVoicePythonPath'] },
  { configKey: 'cosyVoicePromptAudioPath', settingPath: 'speechify.cosyVoice.promptAudioPath', legacySettingPaths: ['speechify.cosyVoicePromptAudioPath'] },
  { configKey: 'cosyVoicePromptText', settingPath: 'speechify.cosyVoice.promptText', legacySettingPaths: ['speechify.cosyVoicePromptText'] },
  { configKey: 'cosyVoiceRequestTimeoutSeconds', settingPath: 'speechify.cosyVoice.requestTimeoutSeconds', legacySettingPaths: ['speechify.cosyVoiceRequestTimeoutSeconds'] },
  { configKey: 'visionApiKey', settingPath: 'speechify.vision.apiKey', legacySettingPaths: ['speechify.visionApiKey'] },
  { configKey: 'visionEndpoint', settingPath: 'speechify.vision.endpoint', legacySettingPaths: ['speechify.visionEndpoint'] },
  { configKey: 'visionDeployment', settingPath: 'speechify.vision.deployment', legacySettingPaths: ['speechify.visionDeployment'] },
  { configKey: 'refinementDeployment', settingPath: 'speechify.vision.refinementDeployment', legacySettingPaths: ['speechify.refinementDeployment'] },
  { configKey: 'enableTransitions', settingPath: 'speechify.enableTransitions', legacySettingPaths: [] },
  { configKey: 'transitionType', settingPath: 'speechify.transitionType', legacySettingPaths: [] },
  { configKey: 'autoTrimVideo', settingPath: 'speechify.autoTrimVideo', legacySettingPaths: [] }
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
  const settingsObject = parseJsoncObject(settingsJsonText);

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

  return stringifyJsonObject(settingsObject);
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

function stringifyJsonObject(value: Record<string, unknown>): string {
  return `${JSON.stringify(value, null, 2)}\n`;
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
