import { defineContentScript } from 'wxt/utils/define-content-script';
import { detectNewMessage, extractMessageData } from '@/lib/whatsapp';
import { getSettings } from '@/lib/storage';
import './content.css';

// Log helper for debugging
function debugLog(message: string, data?: any) {
  console.log(`[WhatsApp AI Content] ${message}`, data || '');
}

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  cssInjectionMode: 'ui',

  async main(_ctx) {
    debugLog('Content script loaded');

    // Wait for WhatsApp to load
    await waitForWhatsAppLoad();
    debugLog('WhatsApp loaded');

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
    observeMessages();

    // Set up keyboard shortcut for manual trigger (Ctrl+Shift+A)
    setupKeyboardShortcut();

    // Also observe for chat switches
    observeChatSwitches();

    debugLog('All observers and shortcuts initialized');
  },
});

function waitForWhatsAppLoad(): Promise<void> {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      // Try multiple selectors for the chat container
      const chatContainer = document.querySelector('[data-testid="conversation-panel-body"]') ||
        document.querySelector('#main') ||
        document.querySelector('[data-testid="conversation-panel"]');
      if (chatContainer) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      debugLog('WhatsApp load timeout - proceeding anyway');
      resolve();
    }, 30000);
  });
}

function createSidebarContainer(): HTMLElement {
  // Create a container div for the sidebar
  const container = document.createElement('div');
  container.id = 'whatsapp-ai-sidebar-root';
  container.style.position = 'fixed';
  container.style.right = '0';
  container.style.top = '0';
  container.style.zIndex = '9999';
  document.body.appendChild(container);
  return container;
}

// Store sidebar update function
let updateSidebar: ((action: string, data: any) => void) | null = null;

export function setSidebarUpdater(updater: (action: string, data: any) => void) {
  updateSidebar = updater;
}

// Export for manual trigger
export async function triggerSuggestions() {
  debugLog('Manual trigger activated');

  const messageData = extractMessageData();
  if (!messageData) {
    debugLog('No message data found');
    if (updateSidebar) {
      updateSidebar('showSuggestions', {
        suggestions: [],
        message: '',
        error: 'No messages found. Please open a chat with messages.',
      });
    }
    return;
  }

  debugLog('Message data extracted:', messageData);

  // Show loading state
  if (updateSidebar) {
    updateSidebar('loading', {});
  }

  // Send to background script for AI processing
  try {
    const response = await browser.runtime.sendMessage({
      action: 'generateSuggestions',
      data: messageData,
    });

    debugLog('Response from background:', response);

    // Update sidebar with suggestions
    if (updateSidebar) {
      updateSidebar('showSuggestions', {
        suggestions: response.suggestions || [],
        message: messageData.currentMessage,
        error: response.error || null,
      });
    }
  } catch (error: any) {
    console.error('[WhatsApp AI] Error generating suggestions:', error);

    let errorMessage = error.message || 'Failed to generate suggestions';
    if (errorMessage.includes('Extension context invalidated')) {
      errorMessage = 'Extension updated. Please refresh the page.';
    }

    if (updateSidebar) {
      updateSidebar('showSuggestions', {
        suggestions: [],
        message: messageData.currentMessage,
        error: errorMessage,
      });
    }
  }
}

function setupKeyboardShortcut() {
  document.addEventListener('keydown', (event) => {
    // Ctrl+Shift+A for manual trigger
    if (event.ctrlKey && event.shiftKey && event.key === 'A') {
      event.preventDefault();
      debugLog('Keyboard shortcut triggered (Ctrl+Shift+A)');
      triggerSuggestions();
    }
  });
  debugLog('Keyboard shortcut registered: Ctrl+Shift+A');
}

function observeChatSwitches() {
  // Observe for when user switches to a different chat
  const sidePanel = document.querySelector('[data-testid="conversation-panel-wrapper"]') ||
    document.querySelector('#main');

  if (!sidePanel) {
    debugLog('Side panel not found for chat switch observation');
    return;
  }

  const chatSwitchObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        debugLog('Chat switch detected, re-initializing observer');

        // Reset state for new chat
        lastProcessedMessage = '';

        // Small delay to let the new chat load
        setTimeout(() => {
          // OPTIMIZATION: Initialize lastProcessedMessage with the current latest message
          // This prevents auto-generation for the message that is ALREADY on screen when opening the chat.
          // The user can click "Scan Messages" if they want to generate a response for it.
          const initialData = extractMessageData();
          if (initialData) {
            lastProcessedMessage = initialData.currentMessage;
            debugLog('Chat loaded. Initialized state to prevent auto-trigger:', lastProcessedMessage.substring(0, 50));
          }

          observeMessages();
        }, 1000);
        break;
      }
    }
  });

  chatSwitchObserver.observe(sidePanel, {
    childList: true,
  });

  debugLog('Chat switch observer initialized');
}

// Store the current message observer to clean it up
let currentMessageObserver: MutationObserver | null = null;
let lastProcessedMessage = '';
let debounceTimer: NodeJS.Timeout;

function observeMessages() {
  if (currentMessageObserver) {
    debugLog('Disconnecting previous message observer');
    currentMessageObserver.disconnect();
    currentMessageObserver = null;
  }

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  // Try multiple selectors for the chat container
  const chatContainerSelectors = [
    '[data-testid="conversation-panel-body"]',
    '[data-testid="conversation-panel-messages"]',
    '#main [role="application"]',
    '.copyable-area > div:last-child',
  ];

  let chatContainer: Element | null = null;
  for (const selector of chatContainerSelectors) {
    chatContainer = document.querySelector(selector);
    if (chatContainer) {
      debugLog('Found chat container with selector:', selector);
      break;
    }
  }

  if (!chatContainer) {
    debugLog('Chat container not found');
    return;
  }

  // NOTE: We don't reset lastProcessedMessage here to avoid re-firing for the same message 
  // if observer is re-initialized on the SAME chat.
  // It should only be reset if we are sure the chat actually changed.

  currentMessageObserver = new MutationObserver((mutations) => {
    let hasNewMessage = false;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          // Check if this looks like a message node
          if (detectNewMessage(node)) {
            hasNewMessage = true;
            debugLog('New message detected via mutation');
          }
        }
      });
    });

    if (hasNewMessage) {
      // Debounce: wait 1 second before processing (reduced from 2s for responsiveness)
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const messageData = extractMessageData();

        // Check if message is valid and different from last processed
        if (messageData && (messageData.currentMessage !== lastProcessedMessage)) {
          lastProcessedMessage = messageData.currentMessage;
          debugLog('Processing new message:', messageData.currentMessage.substring(0, 50));

          // Filter out short messages to save API costs
          if (messageData.currentMessage.trim().length < 8) {
            debugLog('Skipping short message (< 8 chars):', messageData.currentMessage);
            return;
          }

          // Show loading state
          if (updateSidebar) {
            updateSidebar('loading', {});
          }

          // Send to background script for AI processing
          try {
            const response = await browser.runtime.sendMessage({
              action: 'generateSuggestions',
              data: messageData,
            });

            // Update sidebar with suggestions
            if (updateSidebar) {
              updateSidebar('showSuggestions', {
                suggestions: response.suggestions || [],
                message: messageData.currentMessage,
                error: response.error || null,
              });
            }
          } catch (error: any) {
            console.error('[WhatsApp AI] Error generating suggestions:', error);

            let errorMessage = error.message || 'Failed to generate suggestions';
            if (errorMessage.includes('Extension context invalidated')) {
              errorMessage = 'Extension updated. Please refresh the page.';
            }

            if (updateSidebar) {
              updateSidebar('showSuggestions', {
                suggestions: [],
                message: messageData.currentMessage,
                error: errorMessage,
              });
            }
          }
        } else {
          debugLog('Skipping processing: Duplicate message or extract failed', {
            current: messageData?.currentMessage,
            last: lastProcessedMessage
          });
        }
      }, 1000); // Reduced debounce
    }
  });

  currentMessageObserver.observe(chatContainer, {
    childList: true,
    subtree: true,
  });

  debugLog('Message observer initialized');
}
