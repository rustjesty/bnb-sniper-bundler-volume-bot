# Contributing to BNB Chain Trading Bot

Thank you for your interest in contributing to this project! This document provides guidelines and best practices for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing Guidelines](#testing-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

- Be respectful and professional in all interactions
- Provide constructive feedback
- Focus on what is best for the community
- Show empathy towards other community members

## Getting Started

1. **Fork the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/bnb-sniper-bundler-volume-bot.git
   cd bnb-sniper-bundler-volume-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Workflow

1. Make your changes in your feature branch
2. Test your changes thoroughly
3. Ensure code follows the project's coding standards
4. Update documentation if needed
5. Commit your changes with clear messages
6. Push to your fork
7. Submit a pull request

## Coding Standards

### JavaScript/Node.js

- **Use ES6+ features** where appropriate
- **Follow consistent naming conventions**:
  - `camelCase` for variables and functions
  - `PascalCase` for classes and constructors
  - `UPPER_SNAKE_CASE` for constants
- **Add JSDoc comments** for all functions:
  ```javascript
  /**
   * Description of function
   * @param {type} paramName - Description
   * @returns {type} Description
   */
  ```
- **Error handling**: Always use try-catch blocks for async operations
- **Logging**: Use descriptive console logs with proper formatting
- **No hardcoded values**: Use environment variables or configuration files

### Solidity

- **Follow Solidity style guide**: https://docs.soliditylang.org/en/latest/style-guide.html
- **Use latest stable version**: Currently 0.8.x
- **NatSpec comments**: Add documentation for all public functions
- **Security first**: Follow best practices and common patterns
- **Gas optimization**: Write efficient code

## Testing Guidelines

- Write tests for all new features
- Ensure all tests pass before submitting PR
- Test on forked mainnet when possible
- Include both positive and negative test cases

```bash
# Run tests
npm test

# Run tests with gas reporting
REPORT_GAS=true npm test
```

## Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat: add slippage protection to swap function
fix: resolve nonce tracking issue in bundle submission
docs: update README with new configuration options
refactor: optimize gas price calculation
```

## Pull Request Process

1. **Update documentation** for any changed functionality
2. **Ensure CI/CD passes** (if applicable)
3. **Request review** from maintainers
4. **Address feedback** promptly and professionally
5. **Squash commits** if requested before merge

### PR Title Format

Use the same format as commit messages:
```
feat: add new feature description
```

### PR Description Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Tested on local fork
- [ ] All tests pass
- [ ] Added new tests

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings generated
```

## Security Considerations

- **Never commit private keys** or sensitive data
- **Review all external dependencies** before adding
- **Follow security best practices** for smart contracts
- **Report security vulnerabilities** privately to maintainers

## Questions?

Feel free to reach out:
- **Telegram**: [@soljesty](https://t.me/soljesty)
- **GitHub Issues**: For bug reports and feature requests

---

Thank you for contributing! 🎉

