import { defineContentScript } from 'wxt/utils/define-content-script';
import { getSettings } from '@/lib/storage';
import { PlatformFactory } from '@/lib/platforms/factory';
import type { PlatformAdapter } from '@/lib/platforms/adapter';
import './content.css';

// Log helper for debugging
function debugLog(message: string, data?: any) {
  console.log(`[WhatsApp AI Content] ${message}`, data || '');
}

let currentAdapter: PlatformAdapter | null = null;
let updateSidebar: ((action: string, data: any) => void) | null = null;

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*', 'https://app.slack.com/*'],
  cssInjectionMode: 'ui',

  async main(_ctx) {
    debugLog('Content script loaded');

    // Get Adapter
    currentAdapter = PlatformFactory.getAdapter();
    if (!currentAdapter) {
      debugLog('No valid platform adapter found for this URL');
      return;
    }
    debugLog(`Initialized adapter for: ${currentAdapter.platformId}`);

    // Wait for App to load
    await currentAdapter.waitForLoad();
    debugLog('Platform loaded');

    // Check if extension is enabled
    const settings = await getSettings();
    if (!settings.isEnabled) {
      debugLog('Extension is disabled');
      return;
    }

    // Create sidebar container
    const sidebarContainer = createSidebarContainer();

    // Mount React sidebar component
    const { mountSidebar } = await import('./sidebar');
    const sidebarInstance = mountSidebar(sidebarContainer);

    // Set up sidebar updater
    setSidebarUpdater(sidebarInstance.update);
    debugLog('Sidebar mounted');

    // Start observing for new messages
    currentAdapter.observeMessages(async (context) => {
      debugLog('New message detected via adapter', context.currentMessage.substring(0, 50));

      if (updateSidebar) {
        updateSidebar('messageDetected', {
          context: context,
          message: context.currentMessage
        });
      }
    });

    // Set up keyboard shortcut
    setupKeyboardShortcut();

    debugLog('All observers and shortcuts initialized');
  },
});

function createSidebarContainer(): HTMLElement {
  const container = document.createElement('div');
  container.id = 'whatsapp-ai-sidebar-root';
  container.style.position = 'fixed';
  container.style.right = '0';
  container.style.top = '0';
  container.style.zIndex = '9999';
  document.body.appendChild(container);
  return container;
}

export function setSidebarUpdater(updater: (action: string, data: any) => void) {
  updateSidebar = updater;
}

// Export for manual trigger
export async function triggerSuggestions() {
  debugLog('Manual trigger activated');

  if (!currentAdapter) return;

  const context = currentAdapter.extractContext();
  if (!context) {
    debugLog('No message context found');
    if (updateSidebar) {
      updateSidebar('showSuggestions', {
        suggestions: [],
        message: '',
        error: 'No messages found. Please open a chat.',
      });
    }
    return;
  }

  debugLog('Context extracted:', context);

  if (updateSidebar) {
    updateSidebar('messageDetected', {
      context: context,
      message: context.currentMessage
    });
  }
}

function setupKeyboardShortcut() {
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'A') {
      event.preventDefault();
      triggerSuggestions();
    }
  });
}

