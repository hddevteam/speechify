# Changelog

All notable changes to the **Speechify** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Preparation for version 2.0.0 release with manual publishing workflow
- Removed automated publishing workflow in favor of manual control

## [2.0.0] - TBD

### 🎯 Major Features Added
- **Complete TypeScript Migration**: Full rewrite from JavaScript to TypeScript with strict type checking
- **Voice Role Selection**: Support for Azure Speech Services roleplay-enabled voices with character selection
- **Enhanced File Naming System**: Clean, intelligent audio file naming without text previews
- **Comprehensive Testing**: 54 automated tests with real Azure API integration testing
- **Advanced Error Handling**: Robust error handling with user-friendly multilingual messages

### 🌍 Internationalization Enhancements
- **Enhanced i18n System**: Complete message coverage with 70+ keys for English and Chinese
- **Voice Role Messages**: Added 8+ new message keys for role selection functionality
- **Consistent Translations**: Professional translation review and terminology standardization
- **VS Code Integration**: Updated package.nls.json files for native VS Code localization

### 🏗️ Technical Infrastructure
- **Modular Architecture**: Separated concerns with utils, services, and types
- **Comprehensive Type Definitions**: Full Azure Speech Services type coverage
- **Professional GitHub Structure**: Templates, workflows, and documentation
- **SEO Optimization**: Enhanced package.json with strategic keywords and descriptions
- **CI/CD Pipeline**: Automated testing across multiple Node.js versions

### 📚 Documentation & Community
- **Professional README**: Modern formatting with badges and feature overview
- **Contributing Guidelines**: Comprehensive development setup and coding standards
- **GitHub Templates**: Issue templates and pull request templates
- **Project Documentation**: Complete copilot-instructions.md for development

### 🔒 Security & Quality
- **Secure Credential Handling**: Safe Azure API key management with test configuration
- **Input Validation**: Comprehensive sanitization and validation
- **Memory Management**: Improved resource cleanup and error handling
- **Zero Legacy Code**: Complete removal of JavaScript files

### Changed
- **BREAKING**: Migrated from JavaScript to TypeScript
- **BREAKING**: Updated minimum VS Code version requirement to 1.82.0
- **BREAKING**: Manual publishing workflow (removed automated marketplace publishing)
- Improved error messages with internationalization support
- Enhanced user experience with better progress feedback
- Upgraded development workflow with modern tooling and practices

### Removed
- Automated GitHub Actions publishing workflow
- All legacy JavaScript files and dependencies

## [1.3.0] - 2025-07-13 (Legacy Version)

### 🎯 Major Features Added
- **Complete TypeScript Migration**: Full rewrite from JavaScript to TypeScript with strict type checking
- **Voice Role Selection**: Support for Azure Speech Services roleplay-enabled voices with character selection
- **Enhanced File Naming System**: Clean, intelligent audio file naming without text previews
- **Comprehensive Testing**: 54 automated tests with real Azure API integration testing
- **Advanced Error Handling**: Robust error handling with user-friendly multilingual messages

### 🌍 Internationalization Enhancements
- **Enhanced i18n System**: Complete message coverage with 70+ keys for English and Chinese
- **Voice Role Messages**: Added 8+ new message keys for role selection functionality
- **Consistent Translations**: Professional translation review and terminology standardization
- **VS Code Integration**: Updated package.nls.json files for native VS Code localization

### 🔧 Technical Improvements
- **API Restructuring**: Simplified `AudioUtils.generateOutputPath()` method signature
- **Type Safety**: Complete TypeScript interfaces for Azure Speech Services
- **Configuration Management**: Enhanced settings persistence and validation
- **Memory Optimization**: Improved resource management and disposal patterns

### 🎵 Audio Processing Updates
- **Clean File Names**: `filename_speechify_YYYYMMDD_HHMM.mp3` for single files
- **Smart Chunking**: `filename_speechify_partXX_YYYYMMDD_HHMM.mp3` for large texts
- **Format Support**: Continued support for MP3, WAV, and OGG formats
- **Quality Improvements**: Better audio buffer handling and compression

### 🛠️ Developer Experience
- **Modern Tooling**: ESLint integration with TypeScript-specific rules
- **Build System**: Optimized compilation and watch modes
- **Code Quality**: Strict TypeScript configuration with comprehensive type coverage
- **Documentation**: Updated code comments and API documentation

### 🐛 Bug Fixes
- Fixed audio file naming containing unwanted text previews
- Resolved TypeScript compilation issues with strict mode
- Improved error handling for invalid Azure credentials
- Fixed memory leaks in audio buffer management

### 🗑️ Removed
- All legacy JavaScript files completely removed
- Deprecated configuration options cleaned up
- Temporary test files and development artifacts removed

## [1.2.0] - 2024-XX-XX

### Added
- Enhanced context menu integration for voice settings
- Improved voice configuration management
- Better user interface for settings access

### Changed
- Modified right-click context menu to include voice settings commands
- Streamlined configuration workflow

### Fixed
- Improved settings persistence across VS Code sessions
- Better error messages for configuration issues

## [1.1.1] - 2024-XX-XX

### Fixed
- **Special Characters**: Resolved issue where text content with special characters could cause conversion failures
- **Text Processing**: Improved text sanitization and encoding handling
- **Error Reporting**: Better error messages for character encoding issues

### Improved
- Unicode text support for international content
- Better handling of markdown and code content with special symbols

## [1.1.0] - 2024-XX-XX

### Added
- **Simplified Voice Selection**: New streamlined process for voice configuration
- **Azure Configuration Command**: Dedicated command for setting up Azure Speech Services credentials
- **Voice Settings Management**: Improved interface for voice preference configuration
- **Command Palette Integration**: All settings accessible through VS Code command palette

### Changed
- Restructured configuration workflow for better user experience
- Enhanced voice selection with preview and description
- Improved Azure credentials management

### Fixed
- Configuration validation and error handling
- Settings synchronization across workspace changes

## [1.0.3] - 2024-XX-XX

### Added
- **Extension Icon**: Professional icon design for marketplace and VS Code interface
- **Visual Branding**: Consistent visual identity across extension interface
- **Marketplace Presentation**: Improved extension listing with proper branding

### Improved
- User recognition and discoverability in VS Code extensions list
- Professional appearance in command palette and menus

## [1.0.2] - 2024-XX-XX

### Added
- **Voice Attribute Configuration**: New options for fine-tuning voice characteristics
- **Speaking Style Selection**: Support for different speech styles (friendly, newscast, etc.)
- **Voice Gender Preferences**: Ability to filter voices by gender
- **Locale Customization**: Enhanced language and region selection

### Improved
- More granular control over speech synthesis parameters
- Better voice preview and selection interface

## [1.0.1] - 2024-XX-XX

### Fixed
- **File Naming Issues**: Resolved problems with incorrect audio file names
- **Path Handling**: Improved file path generation and validation
- **Special Characters**: Better handling of filenames with non-ASCII characters

### Improved
- More reliable file naming convention
- Better error handling for file system operations

## [1.0.0] - 2024-XX-XX

### Added
- **Initial Release**: Core text-to-speech functionality
- **Azure Integration**: Support for Azure Speech Services API
- **MP3 Output**: High-quality audio file generation
- **Text Selection**: Convert selected text or entire documents
- **Basic Configuration**: Essential settings for Azure credentials and voice selection

### Features
- Right-click context menu for text conversion
- Command palette integration
- Basic voice and language selection
- Audio file output in same directory as source

---

## Release Categories

### 🎯 **Major Features**
Significant new functionality that enhances core capabilities

### 🌍 **Internationalization**
Language support, translations, and cultural adaptations

### 🔧 **Technical Improvements**
Code quality, architecture, and development experience enhancements

### 🎵 **Audio Processing**
Speech synthesis, audio quality, and file management improvements

### 🛠️ **Developer Experience**
Tools, documentation, and development workflow improvements

### 🐛 **Bug Fixes**
Problem resolutions and stability improvements

### 🗑️ **Removed**
Deprecated features and cleanup

---

## Migration Notes

### Upgrading to 1.3.0
- **No Configuration Changes Required**: All existing settings are automatically migrated
- **New Features Available**: Voice role selection is now available for supported voices
- **Improved Performance**: TypeScript migration provides better performance and reliability
- **File Naming**: Audio files will use the new clean naming convention going forward

### Backward Compatibility
- All previous configuration options remain supported
- Existing audio files are not affected
- Command names and functionality remain unchanged
- Azure Speech Services integration is fully compatible

---

For detailed technical information and contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).