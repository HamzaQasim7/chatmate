import type { ChatContext } from './types';

export function detectNewMessage(node: HTMLElement): boolean {
  // Check if the node is an incoming message bubble
  const messageContainer = node.querySelector('[data-testid="msg-container"]');
  if (!messageContainer) return false;

  // Check if it's an incoming message (not sent by user)
  const messageIn = node.closest('[data-id*="false"]') || 
                    node.querySelector('[data-testid="msg-container"]')?.getAttribute('data-id')?.includes('false');
  
  // Alternative: check for message-in class or specific WhatsApp structure
  const isIncoming = node.classList.contains('message-in') ||
                     messageContainer.closest('[data-id*="false"]') !== null ||
                     node.querySelector('[data-testid="msg-container"]')?.parentElement?.getAttribute('data-id')?.includes('false');

  return !!messageContainer && isIncoming;
}

export function extractMessageData(): ChatContext | null {
  try {
    // Get sender name from chat header
    const headerElement = document.querySelector('[data-testid="conversation-header"]');
    const senderName = headerElement?.querySelector('[dir="auto"]')?.textContent || 'Client';

    // Get current message (last incoming message)
    const messages = document.querySelectorAll('[data-testid="msg-container"]');
    const lastMessage = Array.from(messages)
      .reverse()
      .find((msg) => {
        const msgId = msg.getAttribute('data-id');
        return msgId && msgId.includes('false'); // false indicates incoming message
      });

    if (!lastMessage) return null;

    const messageText = lastMessage.querySelector('.selectable-text')?.textContent || '';
    if (!messageText.trim()) return null;

    // Get previous messages for context (last 5 messages)
    const allMessages = Array.from(messages)
      .slice(-6, -1)
      .map((msg) => msg.querySelector('.selectable-text')?.textContent || '')
      .filter(Boolean);

    return {
      senderName,
      currentMessage: messageText,
      previousMessages: allMessages,
    };
  } catch (error) {
    console.error('Error extracting message data:', error);
    return null;
  }
}

export function insertTextToWhatsApp(text: string): void {
  const inputField = document.querySelector<HTMLDivElement>(
    'div[contenteditable="true"][data-tab="10"]'
  );

  if (!inputField) {
    console.error('WhatsApp input field not found');
    return;
  }

  // Focus the input field
  inputField.focus();

  // Method 1: Using execCommand (most reliable for WhatsApp)
  document.execCommand('insertText', false, text);

  // Method 2: Fallback if execCommand doesn't work
  if (!inputField.textContent) {
    inputField.textContent = text;
    
    // Trigger input event to update WhatsApp's state
    const inputEvent = new InputEvent('input', {
      bubbles: true,
      cancelable: true,
    });
    inputField.dispatchEvent(inputEvent);
  }

  // Keep focus on input field
  inputField.focus();
}

export function getWhatsAppInputField(): HTMLDivElement | null {
  return document.querySelector('div[contenteditable="true"][data-tab="10"]');
}
