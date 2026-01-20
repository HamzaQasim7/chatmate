import type { PlatformAdapter } from './adapter';
import type { ChatContext } from '../types';

export class SlackAdapter implements PlatformAdapter {
    platformId = 'slack' as const;
    private observer: MutationObserver | null = null;
    private debounceTimer: NodeJS.Timeout | null = null;
    private lastProcessedMessage = '';

    isMatch(url: string): boolean {
        return url.includes('app.slack.com');
    }

    async waitForLoad(): Promise<void> {
        return new Promise((resolve) => {
            const checkInterval = setInterval(() => {
                // Slack's main layout containers
                const appContainer = document.querySelector('.p-client_container') ||
                    document.querySelector('[data-qa="slack_kit_scrollbar"]');
                if (appContainer) {
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
        console.log(`[Slack Adapter] ${message}`, data || '');
    }

    private getMyName(): string | null {
        // Try to find the current user's name from the UI (Top Right Profile)
        const profileImg = document.querySelector('.p-ia__nav__user__avatar img');
        if (profileImg) {
            const alt = profileImg.getAttribute('alt'); // "Profile photo of Hamza"
            if (alt && alt.includes('Profile photo of ')) {
                return alt.replace('Profile photo of ', '').trim();
            }
        }
        return null;
    }

    extractContext(): ChatContext | null {
        try {
            this.debugLog('Starting message extraction...');

            // Strategy: Find the active message list container
            const containers = Array.from(document.querySelectorAll('.c-virtual_list__scroll_container'));
            if (containers.length === 0) return null;

            // Use the last container found (active chat or thread)
            const activeContainer = containers[containers.length - 1];

            // Get messages - look for message kit containers which are the actual message wrappers
            const messageBlocks = activeContainer.querySelectorAll('.c-message_kit__blocks');

            // Filter to only messages with actual text content
            const validMessages = Array.from(messageBlocks).filter(block => {
                const body = block.querySelector('.c-message__body, .p-rich_text_section');
                return body && (body as HTMLElement).innerText?.trim();
            });

            if (validMessages.length === 0) {
                this.debugLog('No valid messages found');
                return null;
            }

            const lastMessageBlock = validMessages[validMessages.length - 1];

            // Find the parent message container to get sender info
            const messageContainer = lastMessageBlock.closest('.c-message_kit__gutter, .c-message_kit__gutter--follow');

            // Extract Sender - look in the gutter area
            let senderName = 'Colleague';
            if (messageContainer) {
                const senderLink = messageContainer.querySelector('.c-message__sender_link, .c-message__sender button');
                if (senderLink) {
                    senderName = (senderLink as HTMLElement).innerText || 'Colleague';
                }
            }
            senderName = senderName.replace(/\n/g, '').trim();

            // Extract Message Text - ONLY from the body element
            let messageText = '';

            // Try multiple selectors for the message body
            const bodySelectors = [
                '.c-message__body',
                '.p-rich_text_section',
                '[data-qa="message-text"]'
            ];

            for (const selector of bodySelectors) {
                const bodyElement = lastMessageBlock.querySelector(selector);
                if (bodyElement) {
                    messageText = (bodyElement as HTMLElement).innerText;
                    break;
                }
            }

            // Remove the sender name if it somehow got included at the start
            if (messageText.startsWith(senderName)) {
                messageText = messageText.substring(senderName.length).trim();
            }

            // Clean up artifacts
            messageText = messageText
                .replace(/^[\s\n]+/, '') // Leading whitespace
                .replace(/([0-9]{1,2}:[0-9]{2}\s?(AM|PM)?)/gi, '') // Timestamps
                .replace(/\n\s*\n/g, '\n') // Excessive newlines
                .trim();

            if (!messageText) {
                this.debugLog('No message text extracted');
                return null;
            }

            this.debugLog('Extracted:', { sender: senderName, message: messageText });

            // Context (History) - get previous messages
            const previousMessages = validMessages
                .slice(-6, -1)
                .map(block => {
                    for (const selector of bodySelectors) {
                        const body = block.querySelector(selector);
                        if (body) {
                            return (body as HTMLElement).innerText?.trim() || '';
                        }
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
            console.error('[Slack Adapter] Error extracting:', error);
            return null;
        }
    }

    insertText(text: string): void {
        // Slack uses ProseMirror/Quill-like editors
        // Selector: .ql-editor or [contenteditable="true"][role="textbox"]

        // We need to find the *active* editor.
        // Heuristic: The editor inside the view we just extracted from?
        // Or just valid editors.
        const editors = document.querySelectorAll('[contenteditable="true"][role="textbox"], .ql-editor');
        if (editors.length === 0) {
            console.error('[Slack Adapter] No editor found');
            return;
        }

        // Prefer the last one (threads usually open on right/top) or focused one
        let targetEditor = editors[editors.length - 1] as HTMLElement;

        // Check for focus
        const focused = document.querySelector(':focus');
        if (focused && (focused.classList.contains('ql-editor') || focused.getAttribute('role') === 'textbox')) {
            targetEditor = focused as HTMLElement;
        }

        targetEditor.focus();

        // Slack's editor is complex. execCommand 'insertText' usually works.
        const success = document.execCommand('insertText', false, text);

        if (!success) {
            // Fallback: Clipboard API? Or direct text manipulation (risky with Rich Text editors)
            // Try setting innerText if empty, but that breaks ProseMirror state usually.
            // Let's try simulating input event
            targetEditor.textContent = text;
            targetEditor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true }));
        }
    }

    observeMessages(onMessage: (context: ChatContext) => void): void {
        this.disconnect();

        // Observe the main client container for changes (subtrees will catch new messages)
        // Slack is a virtual list, so nodes are added/removed constantly.
        const appContainer = document.querySelector('.p-client_container') || document.body;

        this.observer = new MutationObserver((mutations) => {
            let hasNewMessage = false;
            mutations.forEach(m => {
                m.addedNodes.forEach(node => {
                    if (node instanceof HTMLElement) {
                        // Check for new message row that has a body (ignore typing indicators/system messages)
                        if (node.querySelector('.c-message__body') || node.classList.contains('c-message_row')) {
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

                        // Is it me?
                        const isMe =
                            (myName && sender.includes(myName)) ||
                            sender === 'You' ||
                            sender === 'you';

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

        this.observer.observe(appContainer, { childList: true, subtree: true });
        this.debugLog('Observer initialized');
    }

    disconnect(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
