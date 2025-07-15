# Copilot Instructions for Speechify Extension

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

This is a VS Code extension project that converts text to speech using Azure Speech Services. Please use the get_vscode_api with a query as input to fetch the latest VS Code API references when working with VS Code extension development.

## Available Development Tools

### Local Tools & CLI
- **GitHub CLI (`gh`)**: Used for repository management, issue tracking, and automated workflows
  - Branch operations and pull requests
  - Issue and release management
  - CI/CD workflow interaction
  - Repository configuration

- **SVG Conversion (`rsvg-convert`)**:
  - Converting SVG assets to PNG/PDF
  - Icon and badge generation
  - Documentation graphics processing
  - Build-time asset optimization

### Tool Usage Guidelines

#### GitHub CLI Best Practices
- Use `gh` for automated workflows and CI/CD integration
- Maintain consistent commit messages and branch naming
- Follow repository governance through CLI commands
- Automate release and version management

#### SVG Asset Management
- Convert icons and badges during build process
- Maintain vector source files in repository
- Generate optimized assets for documentation
- Support high DPI and accessibility requirements

### Integration with VS Code Extension
- GitHub CLI for extension publishing workflow
- SVG conversion for extension icons and badges
- Automated asset pipeline in build process
- Quality assurance and release automation


## Project Overview
Speechify is a VS Code extension that provides text-to-speech conversion functionality:
- Transform selected text or entire documents into high-quality speech
- Support for Azure Speech Services with multiple voices and styles
- Advanced voice role selection for roleplay-enabled voices
- Real-time audio generation with progress feedback
- Multi-language interface (English and Chinese with extensible architecture)
- Smart file naming and audio chunk management

## Project Status
- **VS Code Marketplace**: Published as "Speechify" (luckyXmobile.speechify)
- **GitHub Repository**: https://github.com/hddevteam/speechify
- **License**: MIT
- **Target Audience**: Content creators, accessibility users, language learners, developers

## Architecture
- `src/extension.ts` - Main extension entry point (TypeScript)
- `src/types/` - TypeScript type definitions for Azure Speech Services
- `src/utils/` - Utility functions (configuration, Azure API, audio handling)
- `src/services/` - Core speech synthesis service
- `src/i18n/` - Internationalization support
  - `index.ts` - I18n manager and interface definitions
  - `en.ts` - English language pack
  - `zh-cn.ts` - Chinese language pack
- `src/test/` - Comprehensive test suite with real Azure API integration
- `voice-list.json` - Azure Speech Services voice configuration

## Key Features
- **Text-to-Speech Conversion**: Convert selected text or documents to high-quality audio
- **Azure Speech Services Integration**: Support for 200+ voices in 60+ languages
- **Voice Customization**: Style and role selection for enhanced speech synthesis
- **Advanced Voice Roles**: Support for roleplay-enabled voices with character selection
- **Smart Audio Management**: Intelligent file naming and chunk handling for large texts
- **Real-time Processing**: Live progress feedback during speech generation
- **Multi-language Support**: English and Chinese interface with extensible i18n system
- **Configuration Management**: Persistent settings for Azure credentials and voice preferences

## Coding Guidelines
1. **Follow TypeScript best practices** for VS Code extensions with strict type checking
2. **Use VS Code API properly** - always check API references before implementation
3. **Error handling** - provide comprehensive error handling with user-friendly messages
4. **Azure Integration** - handle API rate limits, authentication, and service errors gracefully
5. **Performance** - optimize for large text processing and memory efficiency
6. **Memory management** - properly dispose of audio buffers and event listeners
7. **Internationalization (i18n)** - ALWAYS use the I18n system for user-facing text
8. **Code comments** - write all code comments in English for international collaboration
9. **Language consistency** - maintain consistent terminology across all supported languages
10. **Commit messages** - write all commit messages in English using conventional commits

## TypeScript Configuration
The project uses strict TypeScript configuration with:
- **Target**: ES2020 for modern JavaScript features
- **Strict Mode**: Enabled for better type safety
- **Source Maps**: Enabled for debugging
- **ESLint Integration**: TypeScript-specific rules for code quality

## Internationalization (i18n) Guidelines

### Text Localization Rules
1. **NEVER hardcode user-facing text** - always use `I18n.t()` for any text shown to users
2. **Import I18n** in all files that display user messages: `import { I18n } from '../i18n'`
3. **Use consistent message keys** - follow the established naming convention in language files
4. **Test both languages** - ensure features work correctly in both English and Chinese

### I18n System Usage
```typescript
// ✅ Correct - using I18n system
vscode.window.showInformationMessage(I18n.t('commands.prompterModeActivated'));

// ❌ Wrong - hardcoded text
vscode.window.showInformationMessage('Speech conversion completed');
```

### Adding New Text
1. Add the text key to `src/i18n/en.ts` (English)
2. Add the corresponding translation to `src/i18n/zh-cn.ts` (Chinese)
3. Update the `Messages` interface in `src/i18n/index.ts` if needed
4. Use `I18n.t('category.key')` in your code

### Language Detection Priority
1. VS Code language setting (`vscode.env.language`)
2. Chinese variants (zh-cn, zh) → Chinese interface
3. All others → English interface (default)

## Azure Speech Services Integration

### Configuration Requirements
- Azure Speech Services subscription key (required)
- Azure region (default: eastus)
- Voice selection with style and role support
- Secure credential handling with workspace-specific settings

### Voice System Architecture
```typescript
interface VoiceListItem {
  ShortName: string;          // e.g., "zh-CN-YunyangNeural"
  Gender: string;             // "Male" | "Female"
  Locale: string;             // e.g., "zh-CN"
  StyleList?: string[];       // Available speaking styles
  RolePlayList?: string[];    // Available roleplay characters
  SecondaryLocaleList?: string[]; // Additional language support
}
```

### Error Handling Patterns
1. **API Failures**: Graceful degradation with user-friendly error messages
2. **Network Issues**: Retry logic with exponential backoff
3. **Authentication**: Clear guidance for credential setup
4. **Rate Limiting**: Automatic request spacing and progress feedback

## Testing Strategy
The project includes comprehensive testing with 54 tests covering:
- **Unit Tests**: Core functionality and utility functions
- **Integration Tests**: VS Code command integration and Azure API interaction
- **i18n Tests**: Message translation and interpolation
- **Configuration Tests**: Settings management and validation
- **Audio Tests**: File generation and naming logic

### Test Configuration
For development testing, create a `test-config.json` file (NOT committed to repository):
```json
{
  "azure": {
    "subscriptionKey": "your-test-key",
    "region": "eastus"
  }
}
```

## Dependencies
- **Core**: VS Code Extension API (vscode)
- **HTTP Client**: axios for Azure Speech Services API
- **Development**: TypeScript, ESLint, @types/vscode
- **Testing**: Mocha with TypeScript support for comprehensive testing

## Configuration Schema
The extension contributes the following configuration options:
- `speechify.azureSpeechServicesKey` - Azure Speech Services subscription key
- `speechify.speechServicesRegion` - Azure region (default: eastus)
- `speechify.voiceName` - Selected voice for speech synthesis
- `speechify.voiceGender` - Voice gender preference
- `speechify.voiceStyle` - Speaking style preference
- `speechify.voiceRole` - Roleplay character selection (for supported voices)

## Command Palette Integration
- `extension.speechify` - Convert selected text or document to speech
- `extension.showSpeechifyVoiceSettings` - Display current voice configuration
- `extension.configureSpeechifyVoiceSettings` - Configure voice preferences
- `extension.configureSpeechifyAzureSettings` - Set up Azure credentials
- `extension.selectSpeechifyVoiceStyle` - Choose speaking style
- `extension.selectSpeechifyVoiceRole` - Select roleplay character

## Development Workflow

### Development Setup
```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch for changes
npm run watch

# Run tests
npm run test:integration

# Lint code
npm run lint
```

### Testing
- Use F5 in VS Code to launch Extension Development Host
- Test in both English and Chinese locales
- Verify Azure Speech Services integration with real API
- Test error handling with invalid credentials
- Validate audio file generation and naming

### Build and Package
```bash
# Build for production
npm run compile

# Package the extension
vsce package
```

### Commit Guidelines
- Use conventional commits: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
- Write in English for international collaboration
- Reference issues: `closes #123` or `fixes #456`
- Keep commits focused and atomic

## Error Handling Patterns
1. **User-Friendly Messages**: Always provide actionable error messages using i18n system
2. **Graceful Degradation**: Extension should work even if some features fail
3. **Logging**: Use VS Code's output channel for debugging information
4. **Recovery**: Provide ways to recover from error states

## Performance Considerations
1. **Audio Processing**: Efficient handling of large text chunks and audio buffers
2. **Memory Management**: Proper disposal of audio data and event listeners
3. **API Optimization**: Request batching and rate limiting for Azure Speech Services
4. **Real-time Feedback**: Progress indicators for long-running operations

## Security Guidelines
1. **Credential Protection**: Never commit Azure keys to repository
2. **User Input Validation**: Sanitize all user inputs and file paths
3. **API Security**: Secure handling of Azure Speech Services authentication
4. **Data Privacy**: No user text is stored or transmitted outside Azure Speech Services

## Accessibility Requirements
1. **Keyboard Navigation**: All features accessible via keyboard and commands
2. **Screen Reader Support**: Proper status announcements and error messages
3. **High Contrast**: UI elements work well in high contrast themes
4. **Audio Quality**: High-quality speech output for accessibility users

## Audio File Management
- **Naming Convention**: `filename_speechify_YYYYMMDD_HHMM.mp3` for single files
- **Chunked Files**: `filename_speechify_partXX_YYYYMMDD_HHMM.mp3` for large texts
- **Format Support**: MP3 (default), WAV, OGG formats
- **Quality Settings**: Configurable audio quality and bitrate

## Future Roadmap
- Enhanced voice preview functionality
- Batch processing for multiple files
- Custom voice model support
- Advanced audio post-processing
- Integration with other cloud speech services
- Voice cloning and custom models

## Resources
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Azure Speech Services Documentation](https://docs.microsoft.com/azure/cognitive-services/speech-service/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
- [Internationalization Guide](https://code.visualstudio.com/api/references/extension-guidelines#internationalization)
