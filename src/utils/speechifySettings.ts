import { SpeechifyConfig } from '../types';

export const SPEECHIFY_WORKSPACE_SETTING_KEYS: Array<keyof SpeechifyConfig> = [
  'speechProvider',
  'azureSpeechServicesKey',
  'speechServicesRegion',
  'voiceName',
  'voiceGender',
  'voiceStyle',
  'voiceRole',
  'cosyVoiceBaseUrl',
  'cosyVoicePythonPath',
  'cosyVoicePromptAudioPath',
  'cosyVoicePromptText',
  'cosyVoiceRequestTimeoutSeconds',
  'visionApiKey',
  'visionEndpoint',
  'visionDeployment',
  'refinementDeployment',
  'enableTransitions',
  'transitionType',
  'autoTrimVideo'
];

export function buildSpeechifyWorkspaceSeedEntries(
  effectiveValues: SpeechifyConfig,
  workspaceValues: Partial<SpeechifyConfig>
): Array<[keyof SpeechifyConfig, SpeechifyConfig[keyof SpeechifyConfig]]> {
  const entries: Array<[keyof SpeechifyConfig, SpeechifyConfig[keyof SpeechifyConfig]]> = [];

  for (const key of SPEECHIFY_WORKSPACE_SETTING_KEYS) {
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
  const workspaceValues = readWorkspaceSpeechifyValues(settingsObject);
  const entries = buildSpeechifyWorkspaceSeedEntries(effectiveValues, workspaceValues);

  if (entries.length === 0) {
    return stringifyJsonObject(settingsObject);
  }

  for (const [key, value] of entries) {
    settingsObject[`speechify.${key}`] = value;
  }

  return stringifyJsonObject(settingsObject);
}

function readWorkspaceSpeechifyValues(settingsObject: Record<string, unknown>): Partial<SpeechifyConfig> {
  const values: Partial<SpeechifyConfig> = {};
  const mutableValues = values as Record<keyof SpeechifyConfig, SpeechifyConfig[keyof SpeechifyConfig]>;

  for (const key of SPEECHIFY_WORKSPACE_SETTING_KEYS) {
    const fullKey = `speechify.${key}`;
    if (Object.prototype.hasOwnProperty.call(settingsObject, fullKey)) {
      mutableValues[key] = settingsObject[fullKey] as SpeechifyConfig[typeof key];
    }
  }

  return values;
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
