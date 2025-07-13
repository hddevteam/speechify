# 🔒 Security Guidelines for Speechify Development

## ⚠️ IMPORTANT SECURITY NOTICE

**A Azure subscription key was accidentally committed to this repository. If you are the owner of the key `00c93f8d1e674003afab2238e04db405`, please take immediate action:**

### Immediate Actions Required:

1. **Regenerate Azure Keys**: Go to your Azure portal and regenerate your Speech Services subscription keys immediately
2. **Update Local Configuration**: Update your local development configuration with the new keys
3. **Review Access Logs**: Check your Azure portal for any unauthorized usage

## 🛡️ Best Practices for API Key Security

### Development Environment Setup

1. **Never commit sensitive files**:
   ```bash
   # These files should NEVER be committed:
   test-config.json
   *.key
   *.secret
   .env
   ```

2. **Use the example template**:
   ```bash
   # Copy the example file
   cp test-config.json.example test-config.json
   
   # Add your real credentials to test-config.json
   # This file is automatically ignored by Git
   ```

3. **Verify .gitignore protection**:
   ```bash
   # Check if sensitive files are ignored
   git check-ignore test-config.json
   # Should return: test-config.json
   ```

### Production Configuration

1. **Use VS Code Settings**: Store credentials in VS Code workspace settings
2. **Environment Variables**: Use environment variables for CI/CD
3. **Azure Key Vault**: For production deployments, use Azure Key Vault

### For Contributors

1. **Before committing**:
   ```bash
   # Check for sensitive files
   git status
   git diff --cached
   
   # Ensure no keys are being committed
   grep -r "subscriptionKey\|secret\|key.*:" --include="*.json" --include="*.js" --include="*.ts" .
   ```

2. **If you accidentally commit sensitive data**:
   ```bash
   # Remove from current commit
   git reset HEAD~1
   git rm test-config.json
   git commit -m "Remove accidentally committed sensitive file"
   
   # Force push to rewrite history (use with caution)
   git push --force-with-lease
   ```

## 🔍 Security Monitoring

### Repository Security Checks

Our CI/CD pipeline includes automated security checks:

```yaml
- name: Check for sensitive files
  run: |
    if find . -name "test-config.json" -not -path "./node_modules/*"; then
      echo "Error: test-config.json found in repository"
      exit 1
    fi
    
    if find . -name "*.key" -not -path "./node_modules/*"; then
      echo "Error: Key files found in repository"
      exit 1
    fi
```

### Local Development Checks

Add this to your pre-commit hook:

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Checking for sensitive files..."

# Check for test config files
if git diff --cached --name-only | grep -E "(test-config\.json|.*\.key|.*\.secret)$"; then
    echo "❌ ERROR: Attempting to commit sensitive files!"
    echo "Please remove these files from your commit:"
    git diff --cached --name-only | grep -E "(test-config\.json|.*\.key|.*\.secret)$"
    exit 1
fi

# Check for hardcoded keys in files
if git diff --cached | grep -E "(subscriptionKey|secret|api[_-]?key)" | grep -v "your-.*-here"; then
    echo "❌ ERROR: Potential hardcoded secrets detected!"
    echo "Please review your changes for hardcoded credentials."
    exit 1
fi

echo "✅ Security check passed"
```

## 📧 Incident Response

If you discover a security issue:

1. **Do NOT create a public issue**
2. **Email the maintainers directly** with details
3. **Include**: What was exposed, when, and potential impact
4. **Follow up**: Confirm the issue has been addressed

## 🔗 Resources

- [Azure Key Management Best Practices](https://docs.microsoft.com/azure/key-vault/general/best-practices)
- [GitHub Security Best Practices](https://docs.github.com/en/code-security/getting-started/securing-your-repository)
- [VS Code Extension Security Guidelines](https://code.visualstudio.com/api/references/extension-guidelines#security)

---

**Remember**: Security is everyone's responsibility. When in doubt, ask for help!
