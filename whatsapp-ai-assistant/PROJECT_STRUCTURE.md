# Project Structure

```
whatsapp-ai-assistant/
├── wxt.config.ts                 # WXT configuration
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.js            # TailwindCSS configuration
├── postcss.config.js             # PostCSS configuration
├── .gitignore                    # Git ignore rules
│
├── entrypoints/                  # WXT entrypoints
│   ├── popup/
│   │   ├── App.tsx              # Popup React component (Settings UI)
│   │   └── style.css            # Popup styles
│   ├── content/
│   │   ├── index.ts             # Content script entry
│   │   └── sidebar.tsx          # Sidebar React component
│   ├── background.ts            # Service worker (Background script)
│   └── content.css              # Content script styles
│
├── components/                   # React components
│   ├── SuggestionCard.tsx       # Reusable suggestion card
│   └── SettingsForm.tsx         # Settings form component
│
├── lib/                          # Utility libraries
│   ├── types.ts                 # TypeScript type definitions
│   ├── storage.ts               # Chrome storage utilities
│   ├── whatsapp.ts             # WhatsApp DOM helpers
│   └── openai.ts               # OpenAI API wrapper
│
└── public/                       # Static assets
    └── manifest.json            # Additional manifest data
```

## Key Files

### Configuration
- **wxt.config.ts**: Extension manifest configuration
- **tsconfig.json**: TypeScript compiler options
- **tailwind.config.js**: TailwindCSS theme and content paths

### Entrypoints
- **popup/App.tsx**: Settings UI (React component)
- **content/index.ts**: Content script that monitors WhatsApp
- **content/sidebar.tsx**: Sidebar UI component (React)
- **background.ts**: Service worker for API calls

### Components
- **SuggestionCard.tsx**: Displays individual AI suggestions
- **SettingsForm.tsx**: Settings form with API key, model, language

### Libraries
- **storage.ts**: Chrome storage API wrapper
- **whatsapp.ts**: WhatsApp Web DOM manipulation
- **openai.ts**: OpenAI API client
- **types.ts**: TypeScript interfaces

## Data Flow

1. **User receives message** → Content script detects via MutationObserver
2. **Content script** → Extracts message data → Sends to background script
3. **Background script** → Calls OpenAI API → Returns suggestions
4. **Content script** → Updates sidebar component with suggestions
5. **User clicks "Insert"** → Content script inserts text into WhatsApp input

## Communication Flow

```
WhatsApp Web Page
    ↓
Content Script (entrypoints/content/index.ts)
    ↓ (browser.runtime.sendMessage)
Background Script (entrypoints/background.ts)
    ↓ (OpenAI API)
OpenAI Servers
    ↓ (suggestions)
Background Script
    ↓ (response)
Content Script
    ↓ (update function)
Sidebar Component (entrypoints/content/sidebar.tsx)
```

## Storage

- **Settings**: Stored in `chrome.storage.local` under key `settings`
- **Last Context**: Stored in `chrome.storage.local` under key `lastContext` (for regeneration)

## Permissions

- **storage**: Access to Chrome storage API
- **activeTab**: Access to active tab (WhatsApp Web)
- **host_permissions**: Access to web.whatsapp.com domain
