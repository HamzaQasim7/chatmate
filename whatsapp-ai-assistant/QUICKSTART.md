# Quick Start Guide

## Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```
   This will:
   - Build the extension
   - Open Chrome with the extension loaded
   - Watch for file changes and auto-reload

## Configuration

1. **Get OpenAI API Key:**
   - Go to https://platform.openai.com/api-keys
   - Create a new API key
   - Copy the key (starts with `sk-`)

2. **Configure Extension:**
   - Click the extension icon in Chrome
   - Paste your OpenAI API key
   - Click "Test Connection" to verify
   - Select your preferred AI model and language
   - Click "Save Settings"

## Usage

1. **Open WhatsApp Web:**
   - Go to https://web.whatsapp.com
   - Log in with your phone

2. **Receive a Message:**
   - When someone sends you a message, wait 2 seconds
   - The AI sidebar will appear on the right side
   - Three suggestions will be generated:
     - 🎯 Professional (formal)
     - 😊 Friendly (warm)
     - ⚡ Quick (brief)

3. **Use Suggestions:**
   - Click "Copy" to copy to clipboard
   - Click "Insert" to add text to WhatsApp input field
   - Click "Regenerate" to get new suggestions
   - Review and edit before sending

## Building for Production

```bash
# Build for Chrome
npm run build

# Create ZIP for Chrome Web Store
npm run zip

# Output: .output/chrome-mv3.zip
```

## Troubleshooting

### Extension doesn't load
- Check browser console for errors
- Make sure all dependencies are installed: `npm install`
- Rebuild: `npm run build`

### Sidebar doesn't appear
- Make sure extension is enabled in settings
- Check that you're on https://web.whatsapp.com
- Open browser console and check for errors
- WhatsApp DOM structure may have changed - check selectors in `lib/whatsapp.ts`

### API errors
- Verify API key is correct
- Check API key has sufficient credits
- Check OpenAI service status
- Review error messages in extension popup

### Suggestions not generating
- Check API key is valid
- Verify model is available (GPT-4 requires access)
- Check network connection
- Review browser console for errors

## Development Tips

- Use Chrome DevTools to inspect extension
- Check `chrome://extensions` for extension logs
- Content script runs in page context
- Background script runs in service worker context
- Popup runs in isolated extension context
