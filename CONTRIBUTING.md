# Contributing to Speechify

Thank you for your interest in contributing to Speechify! This document provides guidelines and information for contributors.

## 🎯 Project Overview

Speechify is a VS Code extension that converts text to speech using Azure Speech Services. Our goal is to provide an accessible, high-quality, and user-friendly text-to-speech solution for developers and content creators.

## 🛠️ Development Setup

### Prerequisites
- **Node.js**: Version 16.x or higher
- **VS Code**: Latest stable version
- **Git**: For version control
- **Azure Account**: For testing speech services (optional but recommended)

### Getting Started
1. **Fork and Clone**
   ```bash
   git clone https://github.com/YOUR_USERNAME/speechify.git
   cd speechify
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Set Up Development Environment**
   ```bash
   # Compile TypeScript
   npm run compile
   
   # Start watch mode for development
   npm run watch
   ```

4. **Create Test Configuration** (Optional)
   ```bash
   # Create test-config.json for Azure API testing
   cp test-config.example.json test-config.json
   # Edit with your Azure credentials (never commit this file!)
   ```

5. **Run Tests**
   ```bash
   npm run test:integration
   npm run lint
   ```

## 📁 Project Structure

```
speechify/
├── src/
│   ├── extension.ts          # Main extension entry point
│   ├── types/               # TypeScript type definitions
│   ├── utils/               # Utility functions
│   ├── services/            # Core business logic
│   ├── i18n/               # Internationalization
│   └── test/               # Test suites
├── .github/                # GitHub templates and workflows
├── package.json            # Extension manifest
└── README.md              # Documentation
```

## 🎨 Coding Standards

### TypeScript Guidelines
- **Strict Mode**: All code must compile with strict TypeScript settings
- **Type Safety**: Use explicit types, avoid `any` when possible
- **Naming**: Use camelCase for variables/functions, PascalCase for classes/types
- **Comments**: Document complex logic and public APIs

### Code Style
```typescript
// ✅ Good
interface VoiceSettings {
    name: string;
    style?: string;
    role?: string;
}

async function convertTextToSpeech(text: string, settings: VoiceSettings): Promise<void> {
    // Implementation with proper error handling
}

// ❌ Avoid
function doStuff(data: any): any {
    // No error handling, unclear naming
}
```

### Internationalization
- **Always use i18n**: Never hardcode user-facing strings
- **Message Keys**: Use hierarchical naming (e.g., `commands.convert.success`)
- **Placeholders**: Use typed interpolation for dynamic content

```typescript
// ✅ Correct
vscode.window.showInformationMessage(I18n.t('commands.convert.success', fileName));

// ❌ Wrong
vscode.window.showInformationMessage('Conversion completed');
```

## 🧪 Testing

### Test Categories
1. **Unit Tests**: Test individual functions and classes
2. **Integration Tests**: Test VS Code extension integration
3. **Azure API Tests**: Test real Azure Speech Services (requires credentials)

### Writing Tests
```typescript
suite('Voice Configuration', () => {
    test('should validate voice settings', () => {
        const settings = { name: 'en-US-JennyNeural', style: 'friendly' };
        assert.ok(validateVoiceSettings(settings));
    });
});
```

### Test Requirements
- All new features must include tests
- Tests should cover both success and error scenarios
- Use descriptive test names and clear assertions
- Mock external dependencies when possible

## 🌍 Internationalization

### Adding New Languages
1. Create language file: `src/i18n/[locale].ts`
2. Implement the `Messages` interface
3. Add locale detection in `src/i18n/index.ts`
4. Update VS Code localization files: `package.nls.[locale].json`

### Translation Guidelines
- Maintain consistent terminology across languages
- Consider cultural context and conventions
- Use native speakers for review when possible
- Test UI layouts with longer text strings

## 🔧 Pull Request Process

### Before Submitting
1. **Test Thoroughly**
   ```bash
   npm run compile
   npm run lint
   npm run test:integration
   ```

2. **Update Documentation**
   - Update README.md if adding features
   - Add/update code comments
   - Update CHANGELOG.md

3. **Follow Commit Convention**
   ```bash
   feat: add voice role selection feature
   fix: resolve audio file naming issue
   docs: update contributing guidelines
   refactor: improve error handling logic
   test: add integration tests for Azure API
   ```

### Pull Request Checklist
- [ ] Code compiles without errors or warnings
- [ ] All tests pass
- [ ] New features include appropriate tests
- [ ] Documentation is updated
- [ ] i18n is properly implemented for user-facing text
- [ ] No sensitive information (API keys, credentials) is committed
- [ ] PR description clearly explains the changes

### PR Template
Use our PR template to ensure all necessary information is provided:
- Description of changes
- Type of change (feature, bug fix, etc.)
- Testing performed
- Breaking changes (if any)
- Related issues

## 🐛 Bug Reports

### Before Reporting
1. Check existing issues to avoid duplicates
2. Test with the latest version
3. Verify it's not a configuration issue

### Bug Report Template
- **Environment**: OS, VS Code version, extension version
- **Steps to Reproduce**: Clear, step-by-step instructions
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Error Messages**: Include any error output
- **Sample Text**: Provide text that causes the issue (remove sensitive info)

## 💡 Feature Requests

### Guidelines
- Clearly describe the problem or use case
- Explain the proposed solution
- Consider alternative approaches
- Discuss potential implementation challenges
- Provide mockups or examples if helpful

### Feature Categories
- **Voice Enhancement**: New voice features or customization options
- **User Experience**: UI/UX improvements
- **Performance**: Speed or memory optimizations
- **Integration**: Compatibility with other tools or services
- **Accessibility**: Features that improve accessibility

## 🔒 Security

### Security Guidelines
- Never commit API keys, passwords, or sensitive data
- Use VS Code's secure storage for user credentials
- Validate all user inputs
- Follow secure coding practices
- Report security vulnerabilities privately

### Sensitive Information
Files that should NEVER be committed:
- `test-config.json` (contains API keys)
- `*.key` files
- Environment files with credentials
- Personal configuration files

## 📋 Code Review

### What Reviewers Look For
- **Functionality**: Does the code work as intended?
- **Code Quality**: Is it readable, maintainable, and well-structured?
- **Performance**: Are there any performance implications?
- **Security**: Are there security considerations?
- **Testing**: Is the code adequately tested?
- **Documentation**: Is it properly documented?

### Review Process
1. Automated checks must pass (CI/CD pipeline)
2. At least one maintainer review required
3. Address feedback promptly and thoroughly
4. Maintain respectful and constructive communication

## 🎉 Recognition

### Contributors
We recognize all contributors in our README and release notes:
- Code contributors
- Documentation improvements
- Bug reports and feature requests
- Translations and localization
- Testing and quality assurance

### Maintainer Path
Active contributors may be invited to become maintainers based on:
- Quality and consistency of contributions
- Understanding of the codebase
- Community involvement and helpfulness
- Commitment to project goals

## 📞 Getting Help

### Channels
- **GitHub Issues**: For bugs and feature requests
- **GitHub Discussions**: For questions and community interaction
- **Code Review**: For technical guidance during development

### Response Times
- We aim to respond to issues within 48 hours
- PRs are typically reviewed within 72 hours
- Complex features may require additional discussion time

## 📚 Resources

### Documentation
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Azure Speech Services](https://docs.microsoft.com/azure/cognitive-services/speech-service/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

### Tools
- [ESLint](https://eslint.org/) for code linting
- [Mocha](https://mochajs.org/) for testing
- [VS Code Extension Generator](https://github.com/Microsoft/vscode-generator-code)

## 📜 License

By contributing to Speechify, you agree that your contributions will be licensed under the same MIT License that covers the project.

---

Thank you for contributing to Speechify! Your efforts help make text-to-speech technology more accessible and useful for everyone. 🎵
