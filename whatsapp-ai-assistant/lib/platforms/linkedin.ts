import type { PlatformAdapter } from './adapter';
import type { ChatContext } from '../types';

export class LinkedInAdapter implements PlatformAdapter {
    platformId = 'linkedin' as const;
    private observer: MutationObserver | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastProcessedMessage = '';

    isMatch(url: string): boolean {
        return url.includes('linkedin.com');
    }

    async waitForLoad(): Promise<void> {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                // Check for ANY messaging container (popup or full page)
                const hasMessaging =
                    document.querySelector('.msg-overlay-conversation-bubble') ||
                    document.querySelector('.msg-s-message-list-content') ||
                    document.querySelector('.msg-convo-wrapper') ||
                    document.querySelector('[class*="msg-overlay"]') ||
                    document.querySelector('[class*="messaging"]');

                if (hasMessaging) {
                    clearInterval(checkInterval);
                    this.debugLog('LinkedIn messaging detected');
                    resolve();
                }
            }, 500);

            // Resolve after 5 seconds anyway to allow manual trigger
            setTimeout(() => {
                clearInterval(checkInterval);
                this.debugLog('Timeout - resolving anyway');
                resolve();
            }, 5000);
        });
    }

    private debugLog(message: string, data?: any) {
        console.log(`[LinkedIn Adapter] ${message}`, data || '');
    }

    private getMyName(): string | null {
        // Try profile photo alt text
        const profilePhoto = document.querySelector('.global-nav__me-photo') as HTMLImageElement;
        if (profilePhoto?.alt) {
            return profilePhoto.alt.split(' ')[0];
        }

        // Try the nav menu
        const navButton = document.querySelector('.global-nav__primary-link-me-menu-trigger');
        if (navButton) {
            const img = navButton.querySelector('img');
            if (img?.alt) return img.alt.split(' ')[0];
        }

        return null;
    }

    extractContext(): ChatContext | null {
        try {
            this.debugLog('Starting message extraction...');

            // STEP 1: Find the active conversation container
            // Try multiple selectors for the popup overlay
            let activeContainer: Element | null = null;

            // Popup overlay selectors (most common)
            const popupSelectors = [
                '.msg-overlay-conversation-bubble--is-active',
                '.msg-overlay-conversation-bubble:not(.msg-overlay-conversation-bubble--is-minimized)',
                '.msg-overlay-conversation-bubble',
                '[class*="msg-overlay-conversation"]',
            ];

            for (const sel of popupSelectors) {
                const el = document.querySelector(sel);
                if (el && el.querySelector('[class*="message"]')) {
                    activeContainer = el;
                    this.debugLog('Found popup container with:', sel);
                    break;
                }
            }

            // Full page messaging selectors
            if (!activeContainer) {
                const fullPageSelectors = [
                    '.msg-s-message-list-content',
                    '.msg-convo-wrapper',
                    '[class*="scaffold-layout__main"]',
                ];
                for (const sel of fullPageSelectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        activeContainer = el;
                        this.debugLog('Found full page container with:', sel);
                        break;
                    }
                }
            }

            if (!activeContainer) {
                this.debugLog('No active conversation container found');
                return null;
            }

            // STEP 2: Find message elements
            // Try multiple selector patterns
            const messageSelectors = [
                '.msg-s-message-list__event',
                '.msg-s-event-listitem',
                '[class*="msg-s-message-list"] [class*="event"]',
                '[class*="message-list"] li',
                '[data-message-id]',
            ];

            let messages: Element[] = [];
            for (const sel of messageSelectors) {
                const found = activeContainer.querySelectorAll(sel);
                if (found.length > 0) {
                    messages = Array.from(found);
                    this.debugLog(`Found ${messages.length} messages with:`, sel);
                    break;
                }
            }

            if (messages.length === 0) {
                this.debugLog('No messages found in container');
                // Log what's in the container for debugging
                this.debugLog('Container classes:', activeContainer.className);
                this.debugLog('Container HTML preview:', activeContainer.innerHTML.substring(0, 500));
                return null;
            }

            // STEP 3: Get the last message
            const lastMessage = messages[messages.length - 1];

            // STEP 4: Extract message text
            const textSelectors = [
                '.msg-s-event-listitem__body',
                '[class*="message-body"]',
                '[class*="event-listitem__body"]',
                'p',
                'span[dir="ltr"]',
            ];

            let messageText = '';
            for (const sel of textSelectors) {
                const textEl = lastMessage.querySelector(sel);
                if (textEl) {
                    messageText = (textEl as HTMLElement).innerText?.trim() || '';
                    if (messageText) {
                        this.debugLog('Found text with:', sel);
                        break;
                    }
                }
            }

            if (!messageText) {
                // Fallback: get all text content
                messageText = (lastMessage as HTMLElement).innerText?.trim() || '';
            }

            // Clean up message text
            messageText = messageText.replace(/\n\s*\n/g, '\n').trim();

            if (!messageText) {
                this.debugLog('No message text found');
                return null;
            }

            // STEP 5: Extract sender name
            let senderName = 'Contact';

            // Try to get sender from message group
            const messageGroup = lastMessage.closest('[class*="message-group"]');
            if (messageGroup) {
                const nameSelectors = [
                    '[class*="message-group__name"] a',
                    '[class*="profile-link"]',
                    '[class*="actor-name"]',
                    'a[href*="/in/"]',
                ];
                for (const sel of nameSelectors) {
                    const nameEl = messageGroup.querySelector(sel);
                    if (nameEl) {
                        senderName = (nameEl as HTMLElement).innerText?.split('•')[0]?.trim() || 'Contact';
                        if (senderName && senderName !== 'Contact') break;
                    }
                }
            }

            // Fallback: Get the conversation header name
            if (senderName === 'Contact') {
                const headerSelectors = [
                    '.msg-overlay-bubble-header__title a',
                    '.msg-overlay-bubble-header__title',
                    '[class*="conversation-title"]',
                    '.msg-thread__link-to-profile',
                ];
                for (const sel of headerSelectors) {
                    const headerEl = document.querySelector(sel);
                    if (headerEl) {
                        senderName = (headerEl as HTMLElement).innerText?.trim() || 'Contact';
                        if (senderName && senderName !== 'Contact') {
                            this.debugLog('Got sender from header:', senderName);
                            break;
                        }
                    }
                }
            }

            this.debugLog('Extracted:', { sender: senderName, message: messageText.substring(0, 50) });

            // STEP 6: Get previous messages for context
            const previousMessages = messages
                .slice(-6, -1)
                .map(msg => {
                    for (const sel of textSelectors) {
                        const el = msg.querySelector(sel);
                        if (el) return (el as HTMLElement).innerText?.trim() || '';
                    }
                    return '';
                })
                .filter(Boolean);

            return {
                senderName,
                currentMessage: messageText,
                previousMessages,
            };

        } catch (error) {
            console.error('[LinkedIn Adapter] Error extracting:', error);
            return null;
        }
    }

    insertText(text: string): void {
        // Find the editor with multiple selectors
        const editorSelectors = [
            '.msg-overlay-conversation-bubble .msg-form__contenteditable',
            '.msg-form__contenteditable',
            '[contenteditable="true"][role="textbox"]',
            '[class*="msg-form"] [contenteditable]',
        ];

        let editor: HTMLElement | null = null;
        for (const sel of editorSelectors) {
            editor = document.querySelector(sel) as HTMLElement;
            if (editor) break;
        }

        if (!editor) {
            this.debugLog('No editor found');
            return;
        }

        editor.focus();

        // Try execCommand first
        const success = document.execCommand('insertText', false, text);

        if (!success) {
            // Fallback: direct DOM manipulation
            const placeholder = editor.querySelector('.msg-form__placeholder');
            if (placeholder) placeholder.remove();

            const p = document.createElement('p');
            p.textContent = text;
            editor.innerHTML = '';
            editor.appendChild(p);

            editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
        }

        this.debugLog('Text inserted');
    }

    observeMessages(onMessage: (context: ChatContext) => void): void {
        this.disconnect();

        // Watch the entire body to catch popup messages
        const container = document.body;

        this.observer = new MutationObserver((mutations) => {
            let hasNewMessage = false;

            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        // Check for any message-related elements
                        if (node.className?.includes?.('msg-s-event') ||
                            node.className?.includes?.('message-list') ||
                            node.querySelector?.('[class*="msg-s-event"]') ||
                            node.querySelector?.('[class*="message-body"]')) {
                            hasNewMessage = true;
                        }
                    }
                });
            });

            if (hasNewMessage) {
                if (this.debounceTimer) clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    const context = this.extractContext();
                    if (context && context.currentMessage !== this.lastProcessedMessage) {
                        const myName = this.getMyName();
                        const sender = context.senderName;

                        // Check if message is from self
                        const isMe =
                            (myName && sender.toLowerCase().includes(myName.toLowerCase())) ||
                            sender.toLowerCase() === 'you';

                        this.debugLog('Check Sender:', { sender, myName, isMe });

                        if (!isMe && context.currentMessage.trim().length >= 2) {
                            this.lastProcessedMessage = context.currentMessage;
                            onMessage(context);
                        } else {
                            this.debugLog('Ignoring message from self or too short');
                        }
                    }
                }, 1500);
            }
        });

        this.observer.observe(container, { childList: true, subtree: true });
        this.debugLog('Observer initialized on document.body');
    }

    disconnect(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
