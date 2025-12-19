import { defineContentScript } from 'wxt/sandbox';
import { detectNewMessage, extractMessageData } from '@/lib/whatsapp';
import { getSettings } from '@/lib/storage';

export default defineContentScript({
  matches: ['https://web.whatsapp.com/*'],
  cssInjectionMode: 'ui',
  
  async main(ctx) {
    console.log('WhatsApp AI Assistant: Content script loaded');

    // Wait for WhatsApp to load
    await waitForWhatsAppLoad();

    // Check if extension is enabled
    const settings = await getSettings();
    if (!settings.isEnabled) {
      console.log('Extension is disabled');
      return;
    }

    // Create sidebar container
    const sidebarContainer = createSidebarContainer();
    
    // Mount React sidebar component
    const { mountSidebar } = await import('./sidebar');
    const sidebarInstance = mountSidebar(sidebarContainer);
    
    // Set up sidebar updater
    setSidebarUpdater(sidebarInstance.update);

    // Start observing for new messages
    observeMessages();
  },
});

function waitForWhatsAppLoad(): Promise<void> {
  return new Promise((resolve) => {
    const checkInterval = setInterval(() => {
      const chatContainer = document.querySelector('[data-testid="conversation-panel-body"]');
      if (chatContainer) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
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

function observeMessages() {
  const chatContainer = document.querySelector('[data-testid="conversation-panel-body"]');
  if (!chatContainer) return;

  let debounceTimer: NodeJS.Timeout;
  let lastProcessedMessage = '';

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement && detectNewMessage(node)) {
          // Debounce: wait 2 seconds before processing
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            const messageData = extractMessageData();
            if (messageData && messageData.currentMessage !== lastProcessedMessage) {
              lastProcessedMessage = messageData.currentMessage;
              
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
                console.error('Error generating suggestions:', error);
                if (updateSidebar) {
                  updateSidebar('showSuggestions', {
                    suggestions: [],
                    message: messageData.currentMessage,
                    error: error.message || 'Failed to generate suggestions',
                  });
                }
              }
            }
          }, 2000);
        }
      });
    });
  });

  observer.observe(chatContainer, {
    childList: true,
    subtree: true,
  });
}
