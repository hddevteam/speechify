# Manual Publishing Guide for Speechify Extension

This guide provides step-by-step instructions for manually publishing the Speechify extension to the VS Code Marketplace.

## Prerequisites

### 1. Install VSCE (Visual Studio Code Extension Manager)
```bash
npm install -g vsce
```

### 2. Get Publisher Access Token
1. Visit [Azure DevOps](https://dev.azure.com/)
2. Sign in with your Microsoft account
3. Go to **User Settings** → **Personal Access Tokens**
4. Create a new token with:
   - **Name**: VS Code Marketplace Publishing
   - **Organization**: All accessible organizations
   - **Expiration**: 1 year (or as needed)
   - **Scopes**: **Marketplace (publish)**
5. Copy the token (you'll need it for publishing)

### 3. Verify Publisher Registration
Ensure your publisher `luckyXmobile` is registered at [VS Code Marketplace](https://marketplace.visualstudio.com/manage).

## Publishing Steps

### 1. Pre-Publishing Checklist

#### Code Quality
- [ ] All TypeScript compiles without errors: `npm run compile`
- [ ] All tests pass: `npm run test:integration`
- [ ] No ESLint errors: `npm run lint`
- [ ] All dependencies are up to date

#### Documentation
- [ ] Update `CHANGELOG.md` with new version details
- [ ] Update `README.md` if needed
- [ ] Verify all documentation is accurate

#### Version Management
- [ ] Update version in `package.json`
- [ ] Ensure version follows semantic versioning (currently planning 3.0.6)
- [ ] Update any version references in documentation

### 2. Build and Test

```bash
# Install dependencies
npm ci

# Run comprehensive tests
npm run test:integration

# Compile TypeScript
npm run compile

# Lint code
npm run lint
```

### 3. Package the Extension

```bash
# Create .vsix package
vsce package

# This will create: speechify-3.0.6.vsix
```

### 4. Test the Package Locally

```bash
# Install locally for testing
code --install-extension speechify-3.0.6.vsix

# Test the extension thoroughly
# - Try all commands
# - Test with different configurations
# - Test in both English and Chinese
# - Verify Azure Speech Services integration
```

### 5. Publish to Marketplace

```bash
# Login to marketplace (first time only)
vsce login luckyXmobile

# Publish the extension
vsce publish --pat <YOUR_PERSONAL_ACCESS_TOKEN>

# Or publish from package
vsce publish --pat <YOUR_PERSONAL_ACCESS_TOKEN> speechify-3.0.6.vsix
```

### 6. Post-Publishing Tasks

#### Verify Publication
1. Check [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify)
2. Verify the extension page shows correct information
3. Test installation from marketplace: `code --install-extension luckyXmobile.speechify`

#### GitHub Release
1. Create a new release on GitHub
2. Tag version: `v3.0.6`
3. Upload the `.vsix` file as a release asset
4. Write comprehensive release notes

#### Update Documentation
1. Update any version references in documentation
2. Update installation instructions if needed
3. Announce the release in relevant channels

## Version 3.0.6 Specific Notes

### Major Changes
- **Complete TypeScript Migration**: Full rewrite from JavaScript
- **Enhanced Internationalization**: Comprehensive English and Chinese support
- **Advanced Voice Features**: Role selection and enhanced Azure integration
- **Professional GitHub Structure**: Templates, workflows, and comprehensive documentation
- **Comprehensive Testing**: 54 automated tests with real Azure API integration

### Breaking Changes
- Minimum VS Code version: 1.82.0
- TypeScript-only codebase (no JavaScript files)
- Updated configuration schema

### Migration Guide for Users
Most users won't need to change anything, but:
- Ensure VS Code 1.82.0 or later
- Existing configurations will continue to work
- New features are available through command palette

## Troubleshooting

### Common Issues

#### Publishing Errors
```bash
# If you get authentication errors
vsce login luckyXmobile

# If package is too large
vsce package --no-yarn

# If you have dependency issues
npm ci --production
```

#### Marketplace Issues
- **Extension not appearing**: Wait 5-10 minutes after publishing
- **Description not updating**: Clear browser cache and wait
- **Installation fails**: Check VS Code version compatibility

### Getting Help
- VS Code Extension API: https://code.visualstudio.com/api
- VSCE Documentation: https://github.com/microsoft/vscode-vsce
- Azure DevOps Support: https://dev.azure.com/support

## Security Considerations

### Token Management
- Never commit Personal Access Tokens to repository
- Use environment variables for automation
- Rotate tokens regularly
- Limit token scope to minimum required permissions

### Package Security
- Verify all dependencies are trusted
- Run security audits: `npm audit`
- Keep dependencies updated
- Review package contents before publishing

## Automation Alternative

If you want to re-enable automated publishing later:
1. Restore `.github/workflows/publish.yml`
2. Add `VSCE_PAT` as GitHub repository secret
3. Create releases to trigger automatic publishing

---

**Current Version**: 3.0.6
**Publisher**: luckyXmobile
**Marketplace**: https://marketplace.visualstudio.com/items?itemName=luckyXmobile.speechify
**GitHub**: https://github.com/hddevteam/speechify
