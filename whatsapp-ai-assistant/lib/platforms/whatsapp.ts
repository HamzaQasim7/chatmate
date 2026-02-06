import type { PlatformAdapter } from './adapter';
import type { ChatContext } from '../types';
import { SelectorManager } from '../selector_manager';
import { getSettings } from '@/lib/storage';



export class WhatsAppAdapter implements PlatformAdapter {
    platformId = 'whatsapp' as const;
    private observer: MutationObserver | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastProcessedMessage = '';
    private onCalibrationNeeded: (() => void) | null = null;
    private contextWindow: number = 5;

    private async refreshSettings() {
        try {
            const settings = await getSettings();
            if (settings.contextWindow) {
                this.contextWindow = settings.contextWindow;
                this.debugLog('Context window updated:', this.contextWindow);
            }
        } catch (e) {
            console.error('Failed to load settings:', e);
        }
    }

    isMatch(url: string): boolean {
        return url.includes('web.whatsapp.com');
    }

    setCalibrationHandler(handler: () => void): void {
        this.onCalibrationNeeded = handler;
    }

    async waitForLoad(): Promise<void> {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                const mainPanelSelector = SelectorManager.getInstance().getSelector('whatsapp', 'main_panel');
                const chatContainer = document.querySelector(mainPanelSelector) ||
                    document.querySelector('[data-testid="conversation-panel-body"]') ||
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

    extractContext(options?: { contextWindow?: number }): ChatContext | null {
        try {
            this.debugLog('Starting message extraction...');
            const sm = SelectorManager.getInstance();

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
            // Remote selector or default
            const rowSelector = sm.getSelector('whatsapp', 'message_container') || 'div[role="row"]';
            const allRows = Array.from(document.querySelectorAll(rowSelector));

            // If specific rows not found, try generic message containers
            const candidates = allRows.length > 0
                ? allRows
                : Array.from(document.querySelectorAll('.message-in, .message-out'));

            if (candidates.length === 0) {
                this.debugLog('No message rows found');
                return null;
            }

            // Identify incoming messages using reliable classes or config
            const incomingClass = sm.getSelector('whatsapp', 'incoming_message_class') || '.message-in';
            const outgoingClass = sm.getSelector('whatsapp', 'outgoing_message_class') || '.message-out';

            const incomingMessages = candidates.filter(el => {
                // Check for explicit class
                if (el.classList.contains(incomingClass.replace('.', ''))) return true;
                if (el.querySelector(incomingClass)) return true;

                // Check outgoing
                if (el.classList.contains(outgoingClass.replace('.', '')) || el.querySelector(outgoingClass)) return false;

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
            // Get context (previous N incoming messages)
            const defaultWindow = 5;
            // Use passed option OR cached setting (this.contextWindow)
            const windowSize = options?.contextWindow || this.contextWindow || defaultWindow;
            // Limit logical cap to 10
            const finalWindowSize = Math.min(Math.max(windowSize, 1), 10);

            const contextMessages = incomingMessages
                .slice(-(finalWindowSize + 1), -1) // e.g. -6 to -1 gets last 5 before current
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
        const sm = SelectorManager.getInstance();
        const remoteSelector = sm.getSelector('whatsapp', 'input_field');

        let inputField = this.findInput(remoteSelector);

        // Fallback: Heuristics
        if (!inputField) {
            this.debugLog('Remote selector failed, trying heuristics...');
            inputField = this.findInputByHeuristics();
        }

        // Final Fallback: Calibration
        if (!inputField) {
            console.error('[WhatsApp Adapter] Input field not found. Triggering calibration.');
            if (this.onCalibrationNeeded) this.onCalibrationNeeded();
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

    private findInput(selector: string): HTMLDivElement | null {
        if (!selector) return null;
        // Handle comma-separated selectors if any
        const parts = selector.split(',').map(s => s.trim());
        for (const part of parts) {
            const el = document.querySelector<HTMLDivElement>(part);
            if (el) return el;
        }
        return null;
    }

    private findInputByHeuristics(): HTMLDivElement | null {
        // 1. Look for contenteditable with specific aria labels
        const ariaLabels = ['Type a message', 'Type your message', 'Message', 'Input text'];
        for (const label of ariaLabels) {
            const el = document.querySelector<HTMLDivElement>(`div[contenteditable="true"][aria-label="${label}"]`);
            if (el) return el;
        }

        // 2. Look for element near the "Send" button (usually microphone or paper plane)
        // This is complex, but we can look for the main footer
        const footer = document.querySelector('footer');
        if (footer) {
            const input = footer.querySelector<HTMLDivElement>('div[contenteditable="true"]');
            if (input) return input;
        }

        return null;
    }

    detectNewMessage(node: HTMLElement): boolean {
        const sm = SelectorManager.getInstance();
        const incomingClass = sm.getSelector('whatsapp', 'incoming_message_class') || '.message-in';
        const outgoingClass = sm.getSelector('whatsapp', 'outgoing_message_class') || '.message-out';

        // 1. Check for explicit class
        if (node.classList.contains(incomingClass.replace('.', ''))) return true;
        if (node.querySelector(incomingClass)) return true;

        // 2. If it has 'message-out', ignore it
        if (node.classList.contains(outgoingClass.replace('.', '')) || node.querySelector(outgoingClass)) return false;

        // 3. Fallback: Check data-id
        // (Only if it's a message row but missing classes)
        const dataId = node.getAttribute('data-id') ||
            node.querySelector('[data-id]')?.getAttribute('data-id') ||
            node.closest('[data-id]')?.getAttribute('data-id') || '';

        if (dataId && dataId.includes('false')) return true;

        // 4. Check for message content wrapper + row role
        const isMessageRow = node.getAttribute('role') === 'row' || node.querySelector('[data-pre-plain-text]') !== null;
        if (isMessageRow && !node.classList.contains(outgoingClass.replace('.', ''))) {
            // If we're unsure, treat as potential message if it has text
            return node.innerText.length > 0;
        }

        return false;
    }

    observeMessages(onMessage: (context: ChatContext) => void): void {
        this.disconnect();
        // Load initial settings
        this.refreshSettings();

        // 1. WATCH FOR CHAT SWITCHES (Header title change)
        const header = document.querySelector('header');
        const mainSelector = SelectorManager.getInstance().getSelector('whatsapp', 'main_panel');
        const mainPanel = document.querySelector(mainSelector) || document.querySelector('#main') || document.querySelector('[data-testid="conversation-panel-wrapper"]');

        if (mainPanel) {
            // Observer for chat switching (when #main is replaced or header changes)
            const switchObserver = new MutationObserver(() => {
                // If header changed or main panel content changed significantly, it's likely a chat switch
                this.lastProcessedMessage = ''; // Reset processed state

                // Wait slightly for DOM to settle then scan
                if (this.debounceTimer) clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    const context = this.extractContext({ contextWindow: this.contextWindow });
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
                    const context = this.extractContext({ contextWindow: this.contextWindow });
                    if (context && context.currentMessage !== this.lastProcessedMessage) {
                        this.lastProcessedMessage = context.currentMessage;
                        // For chat switches, we might want to trigger even if short, but sticking to logic
                        // If it's a valid message context, send it
                        if (context.currentMessage.trim().length >= 2) { // Lowered threshold slightly
                            try {
                                onMessage(context);
                            } catch (e: any) {
                                if (e.message?.includes('Extension context invalidated')) {
                                    this.disconnect();
                                }
                            }
                        }
                    }
                }, 1000);
            }
        });

        this.observer.observe(chatContainer, { childList: true, subtree: true });

        // 3. ROBUST CHAT SWITCH DETECTION (POLLING)
        // MutationObservers can sometimes miss the "switch" event if the DOM is recycled.
        // We poll the header title to detect a context switch reliably.
        let lastTitle = '';
        const pollInterval = setInterval(() => {
            if (!this.observer) {
                clearInterval(pollInterval);
                return;
            }

            const headerTitle = document.querySelector('header span[title]')?.textContent || '';
            if (headerTitle && headerTitle !== lastTitle) {
                this.debugLog('Chat switch detected via Polling:', headerTitle);
                lastTitle = headerTitle;
                this.lastProcessedMessage = ''; // clear cache

                // Force a scan
                const context = this.extractContext({ contextWindow: this.contextWindow });
                if (context) {
                    this.lastProcessedMessage = context.currentMessage;
                    try {
                        onMessage(context);
                    } catch (e: any) {
                        if (e.message?.includes('Extension context invalidated')) {
                            clearInterval(pollInterval);
                            this.disconnect();
                        }
                    }
                }
            }
        }, 1000);

        this.debugLog('Observer & Polling initialized');
    }

    disconnect(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
