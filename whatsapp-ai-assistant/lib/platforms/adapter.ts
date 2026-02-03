import type { ChatContext } from '../types';

export interface PlatformAdapter {
    platformId: 'whatsapp' | 'slack' | 'linkedin';

    /**
     * Wait for the main app to load (e.g. chat container presence)
     */
    waitForLoad(): Promise<void>;

    /**
     * Check if the current page is valid for this platform
     */
    isMatch(url: string): boolean;

    /**
     * Extract current chat context (sender, history, current drafts)
     */
    extractContext(): ChatContext | null;

    /**
     * Insert text into the input field
     */
    insertText(text: string): void;

    /**
     * Observe DOM for new incoming messages
     * @param onMessage Callback function when a new message is detected
     */
    observeMessages(onMessage: (context: ChatContext) => void): void;

    /**
     * Clean up observers
     */
    disconnect(): void;

    /**
     * Set callback for when calibration is needed (elements not found)
     */
    setCalibrationHandler(handler: () => void): void;
}
