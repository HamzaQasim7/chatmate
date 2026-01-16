import type { ChatContext } from './types';

// Log helper for debugging
function debugLog(message: string, data?: any) {
  console.log(`[WhatsApp AI] ${message}`, data || '');
}

export function detectNewMessage(node: HTMLElement): boolean {
  debugLog('Checking node for new message:', node.className);

  // Check if the node is an incoming message bubble using multiple strategies
  const messageContainer = node.querySelector('[data-testid="msg-container"]');

  // Strategy 1: Check for message-in class (WhatsApp's class for incoming messages)
  const hasMessageInClass = node.classList.contains('message-in') ||
    node.querySelector('.message-in') !== null;

  // Strategy 2: Check data-id attribute containing "false" (indicates incoming)
  const dataId = node.getAttribute('data-id') ||
    messageContainer?.getAttribute('data-id') ||
    messageContainer?.closest('[data-id]')?.getAttribute('data-id') || '';
  const isIncomingByDataId = dataId.includes('false');

  // Strategy 3: Check for copyable-text with data-pre-plain-text (contains timestamp and sender)
  const hasCopyableText = node.querySelector('[data-pre-plain-text]') !== null ||
    node.querySelector('.copyable-text') !== null;

  // Strategy 4: Check for focusable-list-item which wraps messages
  const isFocusableItem = node.hasAttribute('data-id') ||
    node.closest('[data-id]') !== null;

  const isIncoming = hasMessageInClass || isIncomingByDataId || (hasCopyableText && isFocusableItem);

  debugLog('Message detection result:', {
    hasMessageInClass,
    isIncomingByDataId,
    hasCopyableText,
    isFocusableItem,
    isIncoming
  });

  return isIncoming;
}

export function extractMessageData(): ChatContext | null {
  try {
    debugLog('Starting message extraction...');

    // Get sender name from chat header - try multiple selectors
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
        debugLog('Found sender name:', senderName);
        break;
      }
    }

    // Get all message containers - try multiple selectors
    // Get all message containers - try multiple selectors
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
        // Validation: ensure found elements look like messages (have text or children)
        const validMessages = Array.from(found).filter(el => el.textContent?.trim());
        if (validMessages.length > 0) {
          messages = validMessages;
          debugLog(`Found ${messages.length} messages with selector: ${selector}`);
          break;
        }
      }
    }

    if (messages.length === 0) {
      debugLog('No messages found with any selector');
      return null;
    }

    // Find the last incoming message
    const incomingMessages = messages.filter((msg) => {
      // Check if message is incoming (not sent by user)
      const parent = msg.closest('[data-id]');
      const dataId = parent?.getAttribute('data-id') || msg.getAttribute('data-id') || '';

      // Class checks
      const hasMessageIn = msg.classList.contains('message-in') ||
        msg.querySelector('.message-in') !== null ||
        parent?.classList.contains('message-in');

      // Data-id check (false = incoming)
      const isIncomingDataId = dataId.includes('false');

      // Attribute fallback
      const hasIncomingAttr = msg.getAttribute('aria-label')?.toLowerCase().includes('remote') || false; // Heuristic

      return isIncomingDataId || hasMessageIn || hasIncomingAttr;
    });

    debugLog(`Found ${incomingMessages.length} incoming messages`);

    const lastIncoming = incomingMessages[incomingMessages.length - 1];
    if (!lastIncoming) {
      // Fallback: just get the last message if no specific incoming found
      debugLog('No incoming messages found, using last message as fallback');
    }

    const targetMessage = lastIncoming || messages[messages.length - 1];

    // Extract message text - try multiple strategies
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
        debugLog('Found message text:', messageText.substring(0, 50) + '...');
        break;
      }
    }

    // Fallback: get textContent directly
    if (!messageText) {
      messageText = targetMessage.textContent || '';
      debugLog('Using fallback textContent:', messageText.substring(0, 50) + '...');
    }

    if (!messageText.trim()) {
      debugLog('No message text found');
      return null;
    }

    // Get previous messages for context (last 5 messages)
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

    const context: ChatContext = {
      senderName,
      currentMessage: messageText.trim(),
      previousMessages: allMessages,
    };

    debugLog('Extracted context:', context);
    return context;
  } catch (error) {
    console.error('[WhatsApp AI] Error extracting message data:', error);
    return null;
  }
}

export function insertTextToWhatsApp(text: string): void {
  // Try multiple selectors for the input field
  const inputSelectors = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
    'footer div[contenteditable="true"]',
    '#main footer div[contenteditable="true"]',
  ];

  let inputField: HTMLDivElement | null = null;
  for (const selector of inputSelectors) {
    inputField = document.querySelector<HTMLDivElement>(selector);
    if (inputField) {
      debugLog('Found input field with selector:', selector);
      break;
    }
  }

  if (!inputField) {
    console.error('[WhatsApp AI] Input field not found');
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
  debugLog('Text inserted successfully');
}

export function getWhatsAppInputField(): HTMLDivElement | null {
  const selectors = [
    'div[contenteditable="true"][data-tab="10"]',
    'div[contenteditable="true"][data-testid="conversation-compose-box-input"]',
    'footer div[contenteditable="true"]',
  ];

  for (const selector of selectors) {
    const field = document.querySelector<HTMLDivElement>(selector);
    if (field) return field;
  }
  return null;
}
