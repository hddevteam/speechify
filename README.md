# 🎵 Speechify - Advanced Text-to-Speech for VS Code

[![Visual Studio Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/luckyXmobile.speechify)](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify)
[![Visual Studio Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/luckyXmobile.speechify)](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify)
[![GitHub License](https://img.shields.io/github/license/hddevteam/speechify)](https://github.com/hddevteam/speechify/blob/main/LICENSE)
[![CI/CD](https://github.com/hddevteam/speechify/actions/workflows/ci.yml/badge.svg)](https://github.com/hddevteam/speechify/actions)

<p align="center">
  <img src="./images/icon-128.png" alt="Speechify Icon" width="128" height="128">
</p>


📖 **[中文文档](README.zh-CN.md)** | **[English Documentation](README.md)** | **[Live Demo](https://hddevteam.github.io/speechify/)**

Transform your VS Code into a powerful AI-driven video production station with **Speechify**! 

## 💡 Why Speechify 3.0? (The Differentiator)

While there are many video editors (CapCut, Premiere Pro, etc.), Speechify is designed for the **Developer's Workflow**.

1. **Zero Context Switching**: Why leave your sanctuary? Edit your code, write your documentation, and generate your demo video all within VS Code.
2. **"Script-as-Code" Philosophy**: Stop fighting with complex timelines and keyframes. Your video is defined by your JSON script. Need to update a feature? Just edit the text and re-generate.
3. **AI Vision-Aware Sync**: Traditional editors require you to manually align speech to visual cues. Speechify uses **Vision AI** to "watch" your screen recording and automatically sync your narrative to UI interactions.
4. **Maintenance-Free Demos**: Technical demos go stale fast. With Speechify, you maintain a transcript, not a multi-gigabyte project file. It's the "CI/CD" equivalent for video content.
5. **Multilingual AI Pipeline**: Seamlessly integrate with **GitHub Copilot** to translate and refine your scripts. Regenerate a complete English or Japanese version of your demo video in seconds using the same visual footage.

## 🎯 Use Cases & Problem Solving

### 📚 **Education & Content Creation**
- **Course Preparation**: Convert lecture notes, code examples, and documentation into audio for teaching materials
- **Video Production**: Generate professional voiceovers for coding tutorials, software demos, and educational content
- **Audio Podcasts**: Create programming podcasts by converting written content into natural speech
- **Online Learning**: Transform technical documentation into accessible audio format for distance learning

### 🎬 **Media & Broadcasting**
- **Audio Books**: Convert technical books, programming guides, and documentation into audiobooks
- **Presentation Narration**: Generate professional narration for technical presentations and demos
- **Multi-language Content**: Create the same content in multiple languages using native speakers
- **Accessibility**: Make written content accessible to visually impaired developers and learners

### 💼 **Professional Development**
- **Code Review**: Listen to code comments and documentation while reviewing code
- **Documentation**: Convert API documentation, README files, and technical specs into audio
- **Meeting Preparation**: Transform meeting notes and technical specifications into audio briefs
- **Language Learning**: Practice pronunciation of technical terms in different languages

### 🔧 **Development Workflow**
- **Multitasking**: Listen to documentation while coding, testing, or debugging
- **Code Comments**: Convert inline comments and documentation strings into speech
- **Error Analysis**: Generate audio summaries of error logs and debugging information
- **Team Communication**: Create audio versions of technical specifications for team sharing

### 🌐 **Accessibility & Inclusion**
- **Visual Impairment Support**: Make development resources accessible to visually impaired programmers
- **Learning Disabilities**: Support developers with dyslexia or other reading difficulties
- **Fatigue Reduction**: Reduce eye strain by listening to documentation instead of reading
- **Mobile Learning**: Continue learning while commuting or exercising

## ✨ Features

### 🎤 **Professional Speech Synthesis**
- **High-Quality Audio**: Generate crystal-clear MP3 audio files using Azure Neural Voices
- **200+ Voices**: Choose from a vast selection of natural-sounding voices in 60+ languages
- **Smart Chunking**: Automatically handles large documents by splitting them into manageable audio segments
- **Real-Time Processing**: Live progress feedback during speech generation

### 🎭 **Advanced Voice Customization**
- **Voice Styles**: Choose from speaking styles like friendly, newscast, cheerful, sad, angry, and more
- **Roleplay Characters**: Select specific character roles for supported voices (narrator, young adult, elderly, etc.)
- **Gender Selection**: Filter voices by male/female preferences
- **Language Support**: Full support for multilingual content with automatic locale detection

### 🌍 **Multilingual Interface**
- **English & Chinese**: Native interface support with automatic language detection
- **Extensible i18n**: Easy to add support for additional languages
- **Consistent Terminology**: Professionally translated interface elements

### 🛠️ **Developer-Friendly**
- **TypeScript**: Fully written in TypeScript with strict type checking
- **VS Code Integration**: Seamless integration with VS Code commands and context menus
- **Configuration Management**: Persistent settings with workspace-level customization
- **Error Handling**: Comprehensive error handling with user-friendly messages

## 🚀 Real-World Applications

### 👨‍🏫 **For Educators & Trainers**
**Scenario: Creating Programming Tutorial Videos**
1. Write teaching scripts or course outlines in VS Code
2. Select text content, right-click and choose "Speechify: Convert Text to Speech"
3. Generate professional voiceover files for video post-production
4. Result: Save recording time while achieving consistent voice quality

**Practical Uses:**
- Create voiceovers for online programming courses
- Generate narration audio for technical demonstrations
- Produce multilingual versions of educational content

### 🎬 **For Content Creators**
**Scenario: Producing Technical Podcasts**
1. Copy technical articles or blog posts into VS Code
2. Use Speechify to convert them into high-quality audio
3. Use directly for podcast publishing or as audio material
4. Result: Quickly generate professional-grade podcast content

**Practical Uses:**
- Convert technical blogs into audio podcasts
- Create tech news broadcasts
- Generate code explanation audio content

### 📺 **For Video Producers**
**Scenario: Creating Programming Tutorial Series**
1. Prepare scripts for each video episode in VS Code
2. Select different voice roles for different characters
3. Batch generate audio files for video editing
4. Result: Maintain audio consistency throughout the series

**Practical Uses:**
- YouTube programming tutorial voiceovers
- Software demonstration video narration
- Product introduction video production

### 🎓 **For Online Course Creators**
**Scenario: Creating Complete Online Courses**
1. Import course materials and documentation into VS Code
2. Convert each chapter into audio lessons
3. Select different voice styles for different difficulty levels
4. Result: Quickly produce professional online audio courses

**Practical Uses:**
- Course creation for Udemy/Coursera platforms
- Corporate training audio materials
- Technical certification training content

## 🚀 Quick Start

### 1. Installation
Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify) or search for "Speechify" in VS Code Extensions.

### 2. Speech Backend Setup

Speechify now supports two speech backends:
- **Azure Speech**: cloud TTS with full Azure voice catalog and accurate word boundaries
- **CosyVoice (Local)**: local FastAPI backend for zero-shot voice cloning, better suited for private/local Chinese workflows

#### Azure Setup

🔒 **Security Best Practice**: Never commit your Azure subscription keys to version control. Always store them securely in VS Code settings or environment variables.

1. Get your [Azure Speech Services](https://azure.microsoft.com/services/cognitive-services/speech-services/) subscription key
2. Open VS Code Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
3. Run "Speechify: Configure Azure Settings"
4. Enter your subscription key and region

**For Developers:**
- Copy `test-config.json.example` to `test-config.json` and add your test credentials
- The `test-config.json` file is automatically ignored by Git for security
- Our CI pipeline includes automated security checks to prevent accidental key exposure

#### Local CosyVoice Setup

1. Clone the bundled upstream dependency:
   ```bash
   git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git vendor/CosyVoice
   ```
2. Install Python 3.10, then create a dedicated virtual environment in `vendor/CosyVoice/.venv310`
3. Install CosyVoice dependencies inside that virtual environment
4. Start the FastAPI server from this repo:
   ```bash
   npm run cosyvoice:start
   ```

Notes:
- The startup script now defaults to `iic/CosyVoice-300M`, which is the correct ModelScope ID for the official FastAPI server path.
- If `vendor/CosyVoice/pretrained_models/CosyVoice-300M` already exists, the script will prefer that fully local model directory.
- Override the model manually with `COSYVOICE_MODEL_DIR=/path/to/model npm run cosyvoice:start`
- A quick local smoke-test reference clip is available at `vendor/CosyVoice/asset/zero_shot_prompt.wav`
- Example prompt transcript: `希望你以后能够做的比我还好呦。`
- CosyVoice zero-shot prompt audio must stay within 30 seconds. Speechify normalizes selected reference media to mono 16 kHz WAV and trims it to a safe length before local synthesis.
- If the backend still reports that the prompt audio is too long, re-save or re-select the reference media once so Speechify can refresh the normalized cache.

### 2.1 Azure OpenAI Configuration (Vision)

Speechify's AI Vision alignment requires Azure OpenAI settings in VS Code (`speechify.visionApiKey`, `speechify.visionEndpoint`, `speechify.visionDeployment`, `speechify.refinementDeployment`).

Fastest setup path:
1. Create or open an **Azure OpenAI** resource.
2. In Azure Portal, open **Keys and Endpoint** and copy:
  - Key → `speechify.visionApiKey`
  - Endpoint (example: `https://<resource>.openai.azure.com`) → `speechify.visionEndpoint`
3. In Azure AI Foundry/Studio, open **Deployments** and copy deployment names:
  - Vision analysis model → `speechify.visionDeployment`
  - Script refinement model → `speechify.refinementDeployment`
4. Paste values into VS Code Settings (`Speechify`).

Recommended model strategies:

| Strategy | visionDeployment | refinementDeployment | When to use |
|---|---|---|---|
| Quality first | `gpt-5.2` | `gpt-5.2` | Best alignment quality, higher cost/latency |
| Cost/speed first | `gpt-5-mini` | `gpt-5-mini` | Faster and cheaper runs |
| Hybrid (recommended) | `gpt-5-mini` | `gpt-5.2` | Balanced cost + better rewrite quality |

### 3. Voice Configuration
1. Open Command Palette
2. Run "Speechify: Configure Voice Settings"
3. Select your preferred language, voice, and style

### 4. Convert Text to Speech
1. Select any text in your editor
2. Right-click and choose "Speechify: Convert Text to Speech"
3. Your audio file will be saved in the same directory as your source file

## 📖 Usage Examples

### Basic Text Conversion
```typescript
// Select this text and convert to speech
const greeting = "Hello, welcome to VS Code Speechify extension!";
```

### Document Conversion
Convert entire markdown documents, code comments, or any text-based content into speech for:
- **Accessibility**: Support users with visual impairments or reading difficulties
- **Content Review**: Listen to your writing while doing other tasks or during commutes
- **Language Learning**: Hear proper pronunciation of technical terms in multiple languages
- **Presentations**: Generate audio narration for demos, tutorials, and educational content
- **Podcast Creation**: Transform written articles into professional podcast episodes
- **Course Materials**: Convert lecture notes and educational content into audio format

### Advanced Voice Features
```javascript
// When using roleplay-enabled voices, you can select specific characters:
// - Narrator: Professional storytelling voice
// - YoungAdultFemale: Energetic and friendly
// - OlderAdultMale: Authoritative and experienced
// - Child: Playful and enthusiastic
```

## ⚙️ Configuration

### Azure Speech Services Settings
- **Subscription Key**: Your Azure Speech Services API key
- **Region**: Azure region (e.g., eastus, westus2, westeurope)

### Voice Customization
- **Voice Name**: Specific voice model (e.g., en-US-JennyNeural, zh-CN-YunyangNeural)
- **Voice Gender**: Male or Female preference
- **Voice Style**: Speaking style (friendly, newscast, cheerful, etc.)
- **Voice Role**: Character role for roleplay-enabled voices

### CosyVoice Settings
- `speechify.speechProvider`
  Purpose: selects the speech backend. Set it to `cosyvoice` when you want to use the local CosyVoice pipeline.
- `speechify.cosyVoiceBaseUrl`
  Purpose: points to your local CosyVoice FastAPI server. The default value is `http://127.0.0.1:50000`.
- `speechify.cosyVoicePromptAudioPath`
  Purpose: points to the reference audio file, or to the audio extracted from a reference video. CosyVoice uses this clip for voice cloning.
- `speechify.cosyVoicePromptText`
  Purpose: stores the transcript for the reference audio. When present, Speechify uses zero-shot cloning; when empty, it falls back to the audio-only path.
- `speechify.cosyVoicePythonPath`
  Purpose: optional override for the local Python runtime path, mainly used by reference-media transcription when auto-detection is not enough.
- `speechify.cosyVoiceRequestTimeoutSeconds`
  Purpose: sets the local CosyVoice request timeout. The default is `300`, because zero-shot generation on a local machine can take several minutes before the first audio chunk appears.

Recommended workspace settings example:

```json
{
  "speechify.speechProvider": "cosyvoice",
  "speechify.cosyVoiceBaseUrl": "http://127.0.0.1:50000",
  "speechify.cosyVoicePromptAudioPath": "${workspaceFolder}/.speechify/reference-audio/my-voice.wav",
  "speechify.cosyVoicePromptText": "This is my local CosyVoice reference transcript.",
  "speechify.cosyVoicePythonPath": "${workspaceFolder}/vendor/CosyVoice/.venv310/bin/python",
  "speechify.cosyVoiceRequestTimeoutSeconds": 300
}
```

Behavior notes:
- If a reference transcript is configured, Speechify uses CosyVoice `inference_zero_shot`
- If the transcript is left empty, Speechify falls back to `inference_cross_lingual`
- CosyVoice returns raw PCM audio, so Speechify wraps it as `.wav`
- CosyVoice does not provide Azure-style word timestamps in this path; subtitle boundaries are approximated from text and audio duration
- Local zero-shot generation can exceed two minutes on some machines. If you still see request timeouts, raise `speechify.cosyVoiceRequestTimeoutSeconds` before assuming the text chunk is too long.

### File Output Settings
- **Format**: Audio format (MP3, WAV, OGG)
- **Quality**: Audio quality and bitrate settings
- **Naming**: Intelligent file naming with timestamps

## 🎯 Advanced Features

### Smart File Management
- **Clean Naming**: `document_speechify_20250713_1430.mp3`
- **Chunked Files**: `document_speechify_part01_20250713_1430.mp3` for large texts
- **Automatic Organization**: Files saved alongside source documents

### Voice Role Selection
For voices that support roleplay characters:
1. Right-click selected text
2. Choose "Speechify: Select Voice Role"
3. Pick from available character roles
4. Settings are automatically saved for future use

### Batch Processing
- **Large Documents**: Automatically split long content into multiple audio files
- **Progress Tracking**: Real-time progress indicators for long operations
- **Error Recovery**: Robust error handling with retry mechanisms

## 🔧 Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `Speechify: Convert Text to Speech` | Convert selected text or document | Right-click menu |
| `Speechify: Configure Azure Settings` | Set up Azure credentials | Command Palette |
| `Speechify: Configure Voice Settings` | Choose voice preferences | Command Palette |
| `Speechify: Select Voice Style` | Change speaking style | Command Palette |
| `Speechify: Select Voice Role` | Choose character role | Command Palette |
| `Speechify: Show Voice Settings` | Display current configuration | Command Palette |

## 📋 Requirements

- **VS Code**: Version 1.82.0 or higher
- **Azure Account**: Active Azure subscription with Speech Services
- **Node.js**: For extension development (developers only)
- **Internet Connection**: Required for Azure Speech Services API

## 🔒 Security & Privacy

- **Local Processing**: Text is only sent to Azure Speech Services for conversion
- **Secure Storage**: Azure credentials are stored securely in VS Code settings
- **No Data Retention**: Microsoft Azure doesn't store your text content
- **Open Source**: Full source code available for security review

## 🌟 Supported Languages & Voices

### Popular Languages
- **English**: 20+ neural voices with multiple styles and roles
- **Chinese (Simplified)**: 15+ voices including roleplay characters
- **Spanish**: 10+ regional variants with natural pronunciation
- **French**: Professional and conversational voice options
- **German**: Business and casual speaking styles
- **Japanese**: Modern and traditional voice characteristics

### Voice Styles
- **Professional**: newscast, customerservice, narration
- **Emotional**: cheerful, sad, angry, excited, friendly
- **Creative**: chat, poetry, lyrical, whispering
- **Character**: assistant, hopeful, shouting, terrified

## 🎯 Professional Workflows

### 📚 **Academic & Research**
- **Thesis Writing**: Convert research papers and technical documents into audio for review
- **Literature Review**: Listen to abstracts and summaries while taking notes
- **Conference Presentations**: Generate consistent narration for academic presentations
- **Peer Review**: Create audio versions of papers for collaborative review sessions

### 🏢 **Enterprise & Business**
- **Technical Documentation**: Convert API docs, user manuals, and specifications into audio
- **Training Materials**: Create audio versions of onboarding and training content
- **Meeting Summaries**: Transform meeting notes into audio briefs for team distribution
- **Product Documentation**: Generate multilingual audio guides for international teams

### 🎨 **Creative Industries**
- **Scriptwriting**: Convert scripts into audio for voice acting direction
- **Game Development**: Create placeholder audio for game dialogue and narration
- **Animation**: Generate temporary voiceovers for animated content
- **Marketing**: Create audio versions of marketing copy and promotional content

## 🛠️ Development

### Contributing
We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details.

### Building from Source
```bash
git clone https://github.com/hddevteam/speechify.git
cd speechify
npm install
npm run compile
```

### Testing
```bash
npm run test:integration  # Run all tests
npm run lint             # Check code quality
```

## 🐛 Known Issues

- Large files (>10MB text) may take several minutes to process
- Some Azure regions may have rate limiting during peak hours
- Voice role selection is only available for supported neural voices

## 📞 Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/hddevteam/speechify/issues)
- **Documentation**: [Full documentation and guides](https://github.com/hddevteam/speechify)
- **VS Code Marketplace**: [Extension page and reviews](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify)

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Microsoft Azure**: For providing excellent Speech Services API
- **VS Code Team**: For the fantastic extension development platform
- **Contributors**: All developers who have contributed to this project
- **Community**: Users who provide feedback and suggestions

---

**Made with ❤️ for the developer community**

*Transform your coding experience with professional text-to-speech capabilities. Perfect for accessibility, content creation, and multilingual development workflows.*
