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
                const hasMessaging =
                    document.querySelector('.msg-overlay-conversation-bubble') ||
                    document.querySelector('.msg-s-message-list-content') ||
                    document.querySelector('.msg-convo-wrapper') ||
                    document.querySelector('[class*="msg-overlay"]') ||
                    document.querySelector('[class*="messaging"]') ||
                    document.querySelector('.msg-overlay-list-bubble') ||
                    document.querySelector('[class*="msg-thread"]') ||
                    document.querySelector('[class*="conversation"]');

                if (hasMessaging) {
                    clearInterval(checkInterval);
                    this.debugLog('LinkedIn messaging detected');
                    resolve();
                }
            }, 500);

            setTimeout(() => {
                clearInterval(checkInterval);
                this.debugLog('Timeout - resolving anyway');
                resolve();
            }, 5000);
        });
    }

    private debugLog(message: string, data?: any) {
        // eslint-disable-next-line no-console
        console.log(`[LinkedIn Adapter] ${message}`, data || '');
    }

    private getMyName(): string | null {
        const profilePhoto = document.querySelector('.global-nav__me-photo') as HTMLImageElement;
        if (profilePhoto?.alt) {
            return profilePhoto.alt.split(' ')[0];
        }

        const navButton = document.querySelector('.global-nav__primary-link-me-menu-trigger');
        if (navButton) {
            const img = navButton.querySelector('img');
            if (img?.alt) return img.alt.split(' ')[0];
        }

        return null;
    }

    // Try to find the active container with multiple selector strategies
    private findActiveContainer(): Element | null {
        // Strategy 1: Look for open conversation bubbles (popup chat)
        const allBubbles = Array.from(document.querySelectorAll('.msg-overlay-conversation-bubble'));
        for (const bubble of allBubbles) {
            const style = window.getComputedStyle(bubble);
            const isVisible = style.display !== 'none' && style.visibility !== 'hidden';
            const notMinimized = !bubble.classList.contains('msg-overlay-conversation-bubble--is-minimized');
            if (isVisible && notMinimized) {
                this.debugLog('Found visible popup bubble');
                return bubble;
            }
        }

        // Strategy 2: Look for focused inbox list bubble
        const focusedBubble = document.querySelector('.msg-overlay-list-bubble--is-active') ||
            document.querySelector('.msg-overlay-list-bubble');
        if (focusedBubble) {
            const style = window.getComputedStyle(focusedBubble);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
                this.debugLog('Found focused list bubble');
                return focusedBubble;
            }
        }

        // Strategy 3: Full page messaging
        const fullPageSelectors = [
            '.msg-s-message-list-content',
            '.msg-convo-wrapper',
            'main.scaffold-layout__main',
            '[class*="scaffold-layout__main"]',
            '.msg-thread',
            '[class*="msg-thread"]',
        ];
        for (const sel of fullPageSelectors) {
            const el = document.querySelector(sel);
            if (el && (el as HTMLElement).offsetParent !== null) {
                this.debugLog('Found full page container:', sel);
                return el;
            }
        }

        // Strategy 4: Generic fallback - any visible messaging container
        const genericSelectors = [
            '[class*="messaging"][class*="container"]',
            '[class*="conversation"][class*="container"]',
            '[class*="msg-"][class*="content"]',
            '[role="main"] [class*="message"]',
        ];
        for (const sel of genericSelectors) {
            try {
                const el = document.querySelector(sel);
                if (el && (el as HTMLElement).offsetParent !== null) {
                    this.debugLog('Found generic container:', sel);
                    return el;
                }
            } catch (e) {
                // Invalid selector, skip
            }
        }

        return null;
    }

    // Find messages within a container
    private findMessages(container: Element): Element[] {
        const messageSelectors = [
            '.msg-s-message-list__event',
            '.msg-s-event-listitem',
            'li.msg-s-message-list__event',
            '[data-message-id]',
            '.msg-s-message-group__meta',
            'li[class*="event-listitem"]',
            '[class*="message-list"] li',
            '[class*="msg-s-message"]',
        ];

        // First try to find a message list container inside
        const listContainer = container.querySelector('.msg-s-message-list-content') ||
            container.querySelector('[class*="message-list"]') ||
            container;

        for (const sel of messageSelectors) {
            try {
                const found = listContainer.querySelectorAll(sel);
                if (found.length > 0) {
                    this.debugLog(`Found ${found.length} messages with: ${sel}`);
                    return Array.from(found);
                }
            } catch (e) {
                // Invalid selector, skip
            }
        }

        return [];
    }

    // Extract text from a message element
    private extractMessageText(messageEl: Element): string {
        const textSelectors = [
            '.msg-s-event-listitem__body',
            '.msg-s-message-group__body',
            '[class*="message-body"]',
            '[class*="event-listitem__body"]',
            'span[dir="ltr"]',
            'p',
        ];

        for (const sel of textSelectors) {
            const textEl = messageEl.querySelector(sel);
            if (textEl) {
                const text = (textEl as HTMLElement).innerText?.trim();
                if (text) return text;
            }
        }

        // Fallback: use innerText of the element itself
        return (messageEl as HTMLElement).innerText?.trim() || '';
    }

    // Main extraction with retry logic
    extractContext(): ChatContext | null {
        return this.extractContextInternal();
    }

    private extractContextInternal(): ChatContext | null {
        try {
            this.debugLog('=== STARTING MESSAGE EXTRACTION ===');

            // Find active container
            const activeContainer = this.findActiveContainer();

            if (!activeContainer) {
                this.debugLog('[FAIL] No active conversation container found');
                return null;
            }

            this.debugLog('Active container found:', activeContainer.className);

            // Find messages
            const messages = this.findMessages(activeContainer);

            if (messages.length === 0) {
                this.debugLog('[FAIL] No messages found in container');
                // Log innerHTML for debugging
                const preview = activeContainer.innerHTML.substring(0, 500);
                this.debugLog('Container preview:', preview);
                return null;
            }

            // Get the last message
            const lastMessage = messages[messages.length - 1];
            this.debugLog('Last message element:', lastMessage.className);

            // Extract message text
            let messageText = this.extractMessageText(lastMessage);
            messageText = messageText.replace(/\n\s*\n/g, '\n').trim();

            if (!messageText) {
                this.debugLog('[FAIL] No message text found');
                return null;
            }

            this.debugLog('Message text:', messageText.substring(0, 50));

            // Extract sender name
            let senderName = this.extractSenderName(lastMessage, activeContainer);
            this.debugLog('Sender:', senderName);

            // Get previous messages for context
            const previousMessages = messages
                .slice(Math.max(0, messages.length - 6), -1)
                .map(msg => this.extractMessageText(msg))
                .filter(text => text.length > 0);

            this.debugLog('=== EXTRACTION COMPLETE ===');

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

    private extractSenderName(messageEl: Element, _container: Element): string {
        let senderName = 'Contact';

        // Try to get sender from message group
        const messageGroup = messageEl.closest('.msg-s-message-list__group') ||
            messageEl.closest('[class*="message-group"]');

        if (messageGroup) {
            const nameSelectors = [
                '.msg-s-message-group__profile-link',
                '.msg-s-message-group__name',
                '[class*="actor-name"]',
                'a[href*="/in/"]',
                'img[alt]',
            ];

            for (const sel of nameSelectors) {
                const nameEl = messageGroup.querySelector(sel);
                if (nameEl) {
                    if (nameEl.tagName === 'IMG') {
                        senderName = (nameEl as HTMLImageElement).alt?.trim() || 'Contact';
                    } else {
                        senderName = (nameEl as HTMLElement).innerText?.split('•')[0]?.trim() || 'Contact';
                    }
                    if (senderName && senderName !== 'Contact') break;
                }
            }
        }

        // Fallback: Conversation header
        if (senderName === 'Contact') {
            const headerSelectors = [
                '.msg-overlay-bubble-header__title',
                '.msg-entity-lockup__entity-title',
                '[class*="conversation-title"]',
                '.msg-thread__link-to-profile',
            ];

            for (const sel of headerSelectors) {
                const headerEl = document.querySelector(sel);
                if (headerEl) {
                    const link = headerEl.querySelector('a');
                    senderName = (link || headerEl as HTMLElement).innerText?.trim() || 'Contact';
                    senderName = senderName.split('\n')[0].trim();
                    if (senderName && senderName !== 'Contact') break;
                }
            }
        }

        return senderName;
    }

    insertText(text: string): void {
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

        const success = document.execCommand('insertText', false, text);

        if (!success) {
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

        const container = document.body;

        this.observer = new MutationObserver((mutations) => {
            let hasNewMessage = false;

            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        if (node.className?.includes?.('msg-s-event') ||
                            node.className?.includes?.('message-list') ||
                            node.className?.includes?.('msg-s-message') ||
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
