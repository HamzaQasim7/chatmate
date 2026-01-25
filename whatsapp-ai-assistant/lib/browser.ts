/**
 * Browser Detection Utility
 * Lightweight, reliable detection for Chrome/Firefox without user-agent sniffing.
 */

export type BrowserType = 'firefox' | 'chromium' | 'unknown';

export function getBrowser(): BrowserType {
    const userAgent = navigator.userAgent.toLowerCase();

    // Check for Firefox explicitly
    if (userAgent.indexOf('firefox') > -1) {
        return 'firefox';
    }

    // Check for Chromium-based browsers (Chrome, Edge, Brave, Opera)
    // Note: Most browsers include 'chrome' in UA, so we check this after Firefox
    if (userAgent.indexOf('chrome') > -1 || userAgent.indexOf('chromium') > -1) {
        return 'chromium';
    }

    // Fallback: If strict checks fail, try to guess based on globals
    // Firefox usually has 'browser' defined but specific behavior differs
    if (typeof browser !== 'undefined' && browser.runtime?.getURL?.('u').startsWith('moz')) {
        return 'firefox';
    }

    // Default to Chromium for WXT if unknowable, as it's the most common target
    return 'chromium';
}
