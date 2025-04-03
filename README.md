# translate-i18n-with-ai

A powerful CLI tool for automatically translating i18n JSON files using Claude AI models by Anthropic. This tool is designed to efficiently handle translations from Thai (th.json) to multiple target languages while preserving the structure and ordering of your translation keys.

## Features

- 🤖 AI-powered translations using Claude models
- 🔄 Incremental translation (only translates new or changed keys)
- 🗂️ Preserves nested object structures and key ordering
- 📦 Handles batch processing for efficient API usage
- 🌐 Supports multiple target languages
- 🔍 Selective directory processing with command arguments

## Installation

### Using npm

```bash
npm install --save-dev translate-i18n-with-ai
```

### Using yarn

```bash
yarn add --dev translate-i18n-with-ai
```

## Configuration

Create a `.env` file in your project root with the following variables:

```env
# Required
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Optional (with defaults shown)
TRANSLATE_ROOT=src/configs/translations
TARGET_LANGS=en (multiple languages separated by commas: en, jp, th)
MAX_BATCH_SIZE=100
```

### Configuration Options

| Option              | Description                                           | Default                    |
| ------------------- | ----------------------------------------------------- | -------------------------- |
| `ANTHROPIC_API_KEY` | Your Anthropic API key for Claude access              | (Required)                 |
| `TRANSLATE_ROOT`    | Root directory containing translation files           | `src/configs/translations` |
| `TARGET_LANGS`      | Comma-separated list of target language codes         | `en`                       |
| `MAX_BATCH_SIZE`    | Maximum number of keys to translate in a single batch | `100`                      |

## Usage

### Basic Usage

Run the translation process for all directories containing `th.json` files:

```bash
npx translate-i18n-with-ai
```

### Using with npm scripts

Add to your `package.json`:

```json
"scripts": {
  "translate": "translate-i18n-with-ai"
}
```

Then run:

```bash
npm run translate
```

## Directory Structure

The tool expects the following directory structure:

```
TRANSLATE_ROOT/
├── component1/
│   ├── th.json  # Source Thai translations
│   └── en.json  # Generated English translations (created automatically)
├── component2/
│   ├── th.json
│   └── en.json
└── ...
```

Each directory should contain a `th.json` file with the source Thai translations. The tool will generate or update corresponding files for each target language (e.g., `en.json`, `fr.json`, etc.).

## How It Works

1. **Discovery**: Finds all directories containing `th.json` files within `TRANSLATE_ROOT`
2. **Analysis**: For each directory, compares existing target language files with the source `th.json`
3. **Translation**:
   - Identifies new keys that need translation
   - Identifies obsolete keys that should be removed
   - Batches translation requests for efficiency
4. **Output**: Generates or updates target language files while preserving the original structure and key order

## Example

### Source file (th.json):

```json
{
  "common": {
    "welcome": "ยินดีต้อนรับ",
    "login": "เข้าสู่ระบบ",
    "signup": "สมัครสมาชิก"
  },
  "dashboard": {
    "title": "แดชบอร์ด",
    "summary": "สรุป"
  }
}
```

### Generated English file (en.json):

```json
{
  "common": {
    "welcome": "Welcome",
    "login": "Login",
    "signup": "Sign up"
  },
  "dashboard": {
    "title": "Dashboard",
    "summary": "Summary"
  }
}
```

## Best Practices

- Keep your source `th.json` files well-organized with logical groupings
- Use descriptive keys that provide context for better translations
- Run translations regularly as you update source files
- Review generated translations for quality and consistency

## Notes

- The script uses Claude 3 Haiku for translations, which provides a good balance of speed and quality
- Translation is performed with some context for better results
- If batch translation fails, the script will automatically fall back to translating keys individually

## License

MIT
