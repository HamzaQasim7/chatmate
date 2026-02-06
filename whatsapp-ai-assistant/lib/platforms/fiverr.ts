import { PlatformAdapter } from './adapter';
import { ChatContext } from '../types';
import { SelectorManager } from '../selector_manager';

export class FiverrAdapter implements PlatformAdapter {
    platformId = 'fiverr' as const;
    private observer: MutationObserver | null = null;
    private calibrationHandler: (() => void) | null = null;
    private lastProcessedMessage: string | null = null;

    async waitForLoad(): Promise<void> {
        return new Promise((resolve) => {
            let attempts = 0;
            const check = () => {
                attempts++;
                // Check for core messaging elements OR just if the page is ready
                const isLoaded =
                    document.querySelector('.inbox-page') ||
                    document.querySelector('.conversation-wrapper') ||
                    document.querySelector('.message-composer') ||
                    // Fallbck: If we have a sidebar or contacts list
                    document.querySelector('.contacts-sidebar') ||
                    // Fallback: If body exists and we are on the right URL, just assume loaded after some time
                    (document.body && attempts > 10); // Force load after ~5 seconds

                if (isLoaded) {
                    resolve();
                } else {
                    setTimeout(check, 500);
                }
            };
            check();
        });
    }

    isMatch(url: string): boolean {
        return url.includes('fiverr.com') && (url.includes('/inbox') || url.includes('/messages'));
    }

    extractContext(options?: { contextWindow?: number }): ChatContext | null {
        const selectors = SelectorManager.getInstance().getSelectors('fiverr');

        // 1. Get Sender Name
        const senderNameEl = document.querySelector(selectors.sender_element || '.header-username, .user-name, .contact-name');
        const senderName = senderNameEl?.textContent?.trim() || 'Client';

        // 2. Extract Messages
        const messageElements = document.querySelectorAll(selectors.message_element || '.msg-body, .message-content, .message-bubble');
        const messages: string[] = [];

        const limit = options?.contextWindow || 5;
        const recentElements = Array.from(messageElements).slice(-limit);

        recentElements.forEach(el => {
            let text = el.textContent?.trim();
            if (!text) return;

            // Heuristic for "Me" vs "Them" identification
            // Check parent containers for alignment classes or "Me" text
            const parent = el.closest('li, .message-line, .message-wrapper') || el.parentElement;
            const containerHtml = (parent?.outerHTML || '').toLowerCase();
            const containerText = (parent?.textContent || '').trim();

            const isMe =
                containerHtml.includes('right') ||
                containerHtml.includes('sent') ||
                containerHtml.includes('outgoing') ||
                containerHtml.includes('message-creator') ||
                // Check if the container starts with "Me" (common in Fiverr text dumps)
                containerText.startsWith('Me') ||
                // Check if "Me" appears in a metadata span nearby
                !!parent?.querySelector('.sender-name, .username')?.textContent?.includes('Me');

            if (isMe) {
                text = `[Me]: ${text}`;
            } else {
                text = `[${senderName}]: ${text}`;
            }

            messages.push(text);
        });

        if (messages.length === 0) return null;

        const currentMessage = messages[messages.length - 1];

        // Avoid re-processing same message immediately
        if (currentMessage === this.lastProcessedMessage) return null;
        this.lastProcessedMessage = currentMessage;

        return {
            senderName,
            currentMessage,
            previousMessages: messages.slice(0, -1)
        };
    }

    insertText(text: string): void {
        const selectors = SelectorManager.getInstance().getSelectors('fiverr');
        // Fiverr input is often a textarea OR a contenteditable div
        // Trying explicit selectors first
        let inputEl = document.querySelector(selectors.input_field ||
            'textarea[placeholder*="Type a message"], #message-input, div.message-composer, div[contenteditable="true"][role="textbox"], .message-editor textarea'
        ) as HTMLElement;

        // Fallback: Scan for ANY visible textarea or contenteditable if simple selection failed
        if (!inputEl) {
            console.log('[FiverrAdapter] Standard selectors failed, scanning for generic inputs...');
            const allTextareas = Array.from(document.querySelectorAll('textarea'));
            const allContentEditables = Array.from(document.querySelectorAll('div[contenteditable="true"]'));

            // Find the most likely candidate (visible and likely near the bottom)
            const candidates = [...allTextareas, ...allContentEditables].filter(el => {
                const style = window.getComputedStyle(el);
                return style.display !== 'none' && style.visibility !== 'hidden' && el.getBoundingClientRect().height > 0;
            });

            if (candidates.length > 0) {
                // Heuristic: Input is usually the last one in the DOM or the one with "message" placehoder
                inputEl = candidates.find(el => el.getAttribute('placeholder')?.toLowerCase().includes('message')) as HTMLElement;

                if (!inputEl) {
                    // Default to the last visible one (usually the chat input at the bottom)
                    inputEl = candidates[candidates.length - 1] as HTMLElement;
                }
                console.log('[FiverrAdapter] Found candidate via scan:', inputEl);
            }
        }

        if (inputEl) {
            inputEl.focus();

            // Handle ContentEditable (Rich Text Input)
            if (inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true') {
                const success = document.execCommand('insertText', false, text);
                if (!success) {
                    inputEl.textContent = text;
                }
            }
            // Handle Textarea/Input
            else if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
                const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                if (nativeTextAreaValueSetter) {
                    nativeTextAreaValueSetter.call(inputEl, text);
                } else {
                    inputEl.value = text;
                }
            }

            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            console.error('[FiverrAdapter] Input field not found. Dumping candidates stats:', {
                textareas: document.querySelectorAll('textarea').length,
                contentEditables: document.querySelectorAll('div[contenteditable="true"]').length
            });
            this.calibrationHandler?.();
        }
    }

    observeMessages(onMessage: (context: ChatContext) => void): void {
        const selectors = SelectorManager.getInstance().getSelectors('fiverr');
        const container = document.querySelector(selectors.chat_container || '.chat-list, .messages-wrapper, .conversation-list');

        if (!container) {
            console.warn('[FiverrAdapter] Chat container not found for observation');
            return;
        }

        this.observer = new MutationObserver(() => {
            const context = this.extractContext();
            if (context) {
                onMessage(context);
            }
        });

        this.observer.observe(container, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    disconnect(): void {
        this.observer?.disconnect();
    }

    setCalibrationHandler(handler: () => void): void {
        this.calibrationHandler = handler;
    }
}
