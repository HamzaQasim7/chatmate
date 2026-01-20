import type { PlatformAdapter } from './adapter';
import type { ChatContext } from '../types';

export class WhatsAppAdapter implements PlatformAdapter {
    platformId = 'whatsapp' as const;
    private observer: MutationObserver | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastProcessedMessage = '';

    isMatch(url: string): boolean {
        return url.includes('web.whatsapp.com');
    }

    async waitForLoad(): Promise<void> {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const chatContainer = document.querySelector('[data-testid="conversation-panel-body"]') ||
                    document.querySelector('#main') ||
                    document.querySelector('[data-testid="conversation-panel"]');
                if (chatContainer) {
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 500);

            setTimeout(() => {
                clearInterval(checkInterval);
                resolve();
            }, 30000);
        });
    }

    private debugLog(message: string, data?: any) {
        console.log(`[WhatsApp Adapter] ${message}`, data || '');
    }

    extractContext(): ChatContext | null {
        try {
            this.debugLog('Starting message extraction...');

            // Get sender name
            const headerSelectors = [
                'header span[dir="auto"][title]',
                '#main header span[title]',
                '[data-testid="conversation-header"] span[title]',
            ];

            let senderName = 'Client';
            for (const selector of headerSelectors) {
                const element = document.querySelector(selector);
                if (element?.textContent?.trim()) {
                    senderName = element.textContent.trim();
                    break;
                }
            }

            // STRATEGY: Get ALL message rows, then filter by class
            // This is more robust than data-id which might change format
            const allRows = Array.from(document.querySelectorAll('div[role="row"]'));

            // If specific rows not found, try generic message containers
            const candidates = allRows.length > 0
                ? allRows
                : Array.from(document.querySelectorAll('.message-in, .message-out'));

            if (candidates.length === 0) {
                this.debugLog('No message rows found');
                return null;
            }

            // Identify incoming messages using reliable classes
            const incomingMessages = candidates.filter(el => {
                // Check for explicit class
                if (el.classList.contains('message-in')) return true;
                if (el.querySelector('.message-in')) return true;

                // If it has 'message-out', it's definitely NOT incoming
                if (el.classList.contains('message-out') || el.querySelector('.message-out')) return false;

                // Fallback: Check data-id for 'false' (legacy check, but useful)
                const dataId = el.getAttribute('data-id') || el.closest('[data-id]')?.getAttribute('data-id');
                if (dataId && dataId.includes('false')) return true;

                return false;
            });

            if (incomingMessages.length === 0) {
                this.debugLog('No incoming messages found');
                return null;
            }

            // Get the last actual message element (the bubble)
            const lastRow = incomingMessages[incomingMessages.length - 1];

            // Find the message bubble within the row
            const messageBubble = lastRow.querySelector('.copyable-text') ||
                lastRow.querySelector('[data-pre-plain-text]') ||
                lastRow;

            // Extract Text - Robust Method
            let messageText = '';

            // 1. Try clean selectable text first (best quality)
            const cleanSpans = messageBubble.querySelectorAll('.selectable-text span[dir="ltr"]');
            if (cleanSpans.length > 0) {
                messageText = Array.from(cleanSpans).map(s => (s as HTMLElement).innerText).join('');
            }

            // 2. Fallback to just selectable text
            if (!messageText) {
                const selectable = messageBubble.querySelector('.selectable-text');
                if (selectable) messageText = (selectable as HTMLElement).innerText;
            }

            // 3. Fallback to raw text but clean it
            if (!messageText) {
                messageText = (messageBubble as HTMLElement).innerText || '';
                // Aggressive cleaning of timestamps and metadata
                messageText = messageText
                    .replace(/\d{1,2}:\d{2}\s*(?:AM|PM)?/gi, '') // Remove time
                    .replace(/\n\s*/g, ' ') // Flatten newlines
                    .trim();
            }

            messageText = messageText.trim();

            if (!messageText || messageText.length < 2) {
                this.debugLog('Extracted text too short or empty');
                return null;
            }

            this.debugLog('Extracted:', { sender: senderName, message: messageText.substring(0, 50) });

            // Get context (previous 5 incoming messages)
            const contextMessages = incomingMessages
                .slice(-6, -1) // Last 5 before current
                .map(row => {
                    const bubble = row.querySelector('.copyable-text') || row;
                    const spans = bubble.querySelectorAll('.selectable-text span[dir="ltr"]');
                    if (spans.length > 0) return Array.from(spans).map(s => (s as HTMLElement).innerText).join('');
                    return (bubble as HTMLElement).innerText?.replace(/\d{1,2}:\d{2}\s*(?:AM|PM)?/gi, '').trim() || '';
                })
                .filter(t => t.length > 0);

            return {
                senderName,
                currentMessage: messageText,
                previousMessages: contextMessages,
            };

        } catch (error) {
            console.error('[WhatsApp Adapter] Error extracting:', error);
            return null;
        }
    }

    insertText(text: string): void {
        const inputSelectors = [
            'div[contenteditable="true"][data-tab="10"]',
            'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
            'footer div[contenteditable="true"]',
            '#main footer div[contenteditable="true"]',
        ];

        let inputField: HTMLDivElement | null = null;
        for (const selector of inputSelectors) {
            inputField = document.querySelector<HTMLDivElement>(selector);
            if (inputField) break;
        }

        if (!inputField) {
            console.error('[WhatsApp Adapter] Input field not found');
            return;
        }

        inputField.focus();
        document.execCommand('insertText', false, text);

        if (!inputField.textContent) {
            inputField.textContent = text;
            const inputEvent = new InputEvent('input', { bubbles: true, cancelable: true });
            inputField.dispatchEvent(inputEvent);
        }
        inputField.focus();
    }

    detectNewMessage(node: HTMLElement): boolean {
        // 1. Check for explicit class
        if (node.classList.contains('message-in')) return true;
        if (node.querySelector('.message-in')) return true;

        // 2. If it has 'message-out', ignore it
        if (node.classList.contains('message-out') || node.querySelector('.message-out')) return false;

        // 3. Fallback: Check data-id
        // (Only if it's a message row but missing classes)
        const dataId = node.getAttribute('data-id') ||
            node.querySelector('[data-id]')?.getAttribute('data-id') ||
            node.closest('[data-id]')?.getAttribute('data-id') || '';

        if (dataId && dataId.includes('false')) return true;

        // 4. Check for message content wrapper + row role
        const isMessageRow = node.getAttribute('role') === 'row' || node.querySelector('[data-pre-plain-text]') !== null;
        if (isMessageRow && !node.classList.contains('message-out')) {
            // If we're unsure, treat as potential message if it has text
            return node.innerText.length > 0;
        }

        return false;
    }

    observeMessages(onMessage: (context: ChatContext) => void): void {
        this.disconnect();

        // 1. WATCH FOR CHAT SWITCHES (Header title change)
        const header = document.querySelector('header');
        const mainPanel = document.querySelector('#main') || document.querySelector('[data-testid="conversation-panel-wrapper"]');

        if (mainPanel) {
            // Observer for chat switching (when #main is replaced or header changes)
            const switchObserver = new MutationObserver(() => {
                // If header changed or main panel content changed significantly, it's likely a chat switch
                this.lastProcessedMessage = ''; // Reset processed state

                // Wait slightly for DOM to settle then scan
                if (this.debounceTimer) clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    const context = this.extractContext();
                    if (context) {
                        this.lastProcessedMessage = context.currentMessage;
                        onMessage(context);
                    }
                }, 500);
            });

            switchObserver.observe(mainPanel, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });
            if (header) {
                switchObserver.observe(header, { childList: true, subtree: true });
            }
            // Also store this observer effectively (we'll just use the main observer property for simplicity or add a new one if needed, 
            // but for now let's combine logic or just let the main message observer handle it if we target right)
        }

        // 2. WATCH FOR NEW MESSAGES
        const chatContainerSelectors = [
            '[data-testid="conversation-panel-body"]',
            '[data-testid="conversation-panel-messages"]',
            '#main [role="application"]',
            '.copyable-area > div:last-child',
        ];

        let chatContainer: Element | null = null;
        for (const selector of chatContainerSelectors) {
            chatContainer = document.querySelector(selector);
            if (chatContainer) break;
        }

        if (!chatContainer) {
            // Retry observing if container not found yet (e.g. initial load)
            setTimeout(() => this.observeMessages(onMessage), 2000);
            return;
        }

        this.observer = new MutationObserver((mutations) => {
            let hasNewMessage = false;
            let isChatSwitch = false;

            mutations.forEach((mutation) => {
                // Check for chat switch (large number of nodes added)
                if (mutation.type === 'childList' && mutation.addedNodes.length > 5) {
                    isChatSwitch = true;
                }

                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement && this.detectNewMessage(node)) {
                        hasNewMessage = true;
                    }
                });
            });

            if (isChatSwitch) {
                this.lastProcessedMessage = ''; // Reset
                hasNewMessage = true; // Force scan
            }

            if (hasNewMessage) {
                if (this.debounceTimer) clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    const context = this.extractContext();
                    if (context && context.currentMessage !== this.lastProcessedMessage) {
                        this.lastProcessedMessage = context.currentMessage;
                        // For chat switches, we might want to trigger even if short, but sticking to logic
                        // If it's a valid message context, send it
                        if (context.currentMessage.trim().length >= 2) { // Lowered threshold slightly
                            onMessage(context);
                        }
                    }
                }, 1000);
            }
        });

        this.observer.observe(chatContainer, { childList: true, subtree: true });
        this.debugLog('Observer initialized');
    }

    disconnect(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
