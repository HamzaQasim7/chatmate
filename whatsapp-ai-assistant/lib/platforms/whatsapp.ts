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
                '[data-testid="conversation-header"] [dir="auto"]',
                '[data-testid="conversation-info-header"] span[dir="auto"]',
                'header span[dir="auto"][title]',
                '#main header span[title]',
            ];

            let senderName = 'Client';
            for (const selector of headerSelectors) {
                const element = document.querySelector(selector);
                if (element?.textContent) {
                    senderName = element.textContent;
                    break;
                }
            }

            // Get messages
            const messageSelectors = [
                '[data-testid="msg-container"]',
                '.message-in, .message-out',
                '[class*="message-in"], [class*="message-out"]',
                'div[role="row"]',
                '[data-id] .copyable-text',
                '.focusable-list-item [data-pre-plain-text]',
            ];

            let messages: Element[] = [];
            for (const selector of messageSelectors) {
                const found = document.querySelectorAll(selector);
                if (found.length > 0) {
                    const validMessages = Array.from(found).filter(el => el.textContent?.trim());
                    if (validMessages.length > 0) {
                        messages = validMessages;
                        break;
                    }
                }
            }

            if (messages.length === 0) return null;

            // Find incoming messages
            const incomingMessages = messages.filter((msg) => {
                const parent = msg.closest('[data-id]');
                const dataId = parent?.getAttribute('data-id') || msg.getAttribute('data-id') || '';
                const hasMessageIn = msg.classList.contains('message-in') ||
                    msg.querySelector('.message-in') !== null ||
                    parent?.classList.contains('message-in');
                const isIncomingDataId = dataId.includes('false');
                const hasIncomingAttr = msg.getAttribute('aria-label')?.toLowerCase().includes('remote') || false;

                return isIncomingDataId || hasMessageIn || hasIncomingAttr;
            });

            const lastIncoming = incomingMessages[incomingMessages.length - 1];
            const targetMessage = lastIncoming || messages[messages.length - 1];

            // Extract text
            const textSelectors = [
                '.selectable-text span',
                '.selectable-text',
                '[data-testid="conversation-compose-box-input"]',
                '.copyable-text span',
                'span.selectable-text',
            ];

            let messageText = '';
            for (const selector of textSelectors) {
                const textElement = targetMessage.querySelector(selector);
                if (textElement?.textContent) {
                    messageText = textElement.textContent;
                    break;
                }
            }

            if (!messageText) messageText = targetMessage.textContent || '';
            if (!messageText.trim()) return null;

            // Context (previous messages)
            const allMessages = messages
                .slice(-6, -1)
                .map((msg) => {
                    for (const selector of textSelectors) {
                        const textEl = msg.querySelector(selector);
                        if (textEl?.textContent) return textEl.textContent;
                    }
                    return msg.textContent || '';
                })
                .filter(Boolean);

            return {
                senderName,
                currentMessage: messageText.trim(),
                previousMessages: allMessages,
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
        const messageContainer = node.querySelector('[data-testid="msg-container"]');
        const hasMessageInClass = node.classList.contains('message-in') || node.querySelector('.message-in') !== null;
        const dataId = node.getAttribute('data-id') ||
            messageContainer?.getAttribute('data-id') ||
            messageContainer?.closest('[data-id]')?.getAttribute('data-id') || '';
        const isIncomingByDataId = dataId.includes('false');
        const hasCopyableText = node.querySelector('[data-pre-plain-text]') !== null || node.querySelector('.copyable-text') !== null;
        const isFocusableItem = node.hasAttribute('data-id') || node.closest('[data-id]') !== null;

        return hasMessageInClass || isIncomingByDataId || (hasCopyableText && isFocusableItem);
    }

    observeMessages(onMessage: (context: ChatContext) => void): void {
        this.disconnect();

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
            // If no chat open, try observing body for chat open
            const sidePanel = document.querySelector('[data-testid="conversation-panel-wrapper"]') || document.querySelector('#main');
            if (sidePanel) {
                const switchObserver = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                            this.lastProcessedMessage = ''; // Reset on switch
                            setTimeout(() => this.observeMessages(onMessage), 1000); // Re-init
                            return;
                        }
                    }
                });
                switchObserver.observe(sidePanel, { childList: true });
            }
            return;
        }

        this.observer = new MutationObserver((mutations) => {
            let hasNewMessage = false;
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement && this.detectNewMessage(node)) {
                        hasNewMessage = true;
                    }
                });
            });

            if (hasNewMessage) {
                if (this.debounceTimer) clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    const context = this.extractContext();
                    if (context && context.currentMessage !== this.lastProcessedMessage) {
                        this.lastProcessedMessage = context.currentMessage;
                        if (context.currentMessage.trim().length >= 8) {
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
