# Development Guide

## Code Quality Tools

This project uses several tools to maintain code quality and consistency:

### ESLint

ESLint is configured for TypeScript and React development. Run linting with:

```bash
npm run lint        # Check for linting errors
npm run lint:fix    # Fix linting errors automatically
```

### Prettier

Prettier ensures consistent code formatting across the project. Run formatting with:

```bash
npm run format        # Format all files
npm run format:check  # Check if files are formatted
```

Configuration is in `.prettierrc`:

- Single quotes
- 2 space indentation
- Semicolons required
- 100 character line width

### Husky Pre-commit Hooks

Husky is configured to run automated checks before each commit:

1. **ESLint** - Automatically fixes linting issues in staged files
2. **Prettier** - Automatically formats staged files

The pre-commit hook uses `lint-staged` to only check files that are being committed, keeping the process fast.

#### How it works:

When you run `git commit`, Husky will automatically:

1. Run ESLint on staged `.ts`, `.tsx`, `.js`, `.jsx` files
2. Run Prettier on staged files
3. Only allow the commit if all checks pass

#### Testing the hook:

```bash
# Make some changes
echo "const test = 'value'" >> src/test.ts

# Stage and commit
git add src/test.ts
git commit -m "test commit"  # Pre-commit hook will run automatically
```

## Development Workflow

1. **Start the dev server:**

   ```bash
   npm run dev
   ```

2. **Make your changes**

3. **Check your code (optional, pre-commit does this):**

   ```bash
   npm run lint:fix
   npm run format
   ```

4. **Commit your changes:**

   ```bash
   git add .
   git commit -m "Your commit message"
   # Pre-commit hook runs automatically!
   ```

5. **Build for production:**
   ```bash
   npm run build
   npm run preview  # Preview the production build
   ```

## Configured Rules

### ESLint Rules

- React hooks rules enforced
- React refresh rules for HMR
- TypeScript type checking enabled

### Lint-staged Configuration

Located in `package.json`:

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx}": ["eslint --fix", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

## Troubleshooting

### Pre-commit hook not running?

```bash
# Reinstall Husky hooks
npm run prepare
```

### Want to skip the pre-commit hook? (Not recommended)

```bash
git commit --no-verify -m "message"
```

### ESLint errors blocking commits?

Fix them manually or run:

```bash
npm run lint:fix
```

### Prettier conflicts with ESLint?

The current setup is configured to work together. Prettier runs after ESLint during the pre-commit hook.
