/**
 * Auth Orchestrator v2
 * Stable OAuth implementation for Chrome/Firefox extensions.
 * 
 * Architecture (from big extensions like Grammarly, Notion):
 * - Popup triggers auth via message
 * - Background opens OAuth tab
 * - Background captures redirect via webNavigation
 * - Session stored in chrome.storage
 * - Popup reads session from storage (never expects promise resolution)
 */

import { supabase } from './supabase';
import { getBrowser } from './browser';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initiates Google OAuth login.
 * IMPORTANT: This does NOT return a session. It just opens the OAuth flow.
 * Popup should poll/listen for session in storage after calling this.
 */
export async function loginWithGoogle(): Promise<{ success: boolean; error?: string }> {
    try {
        // 1. Get OAuth URL from Supabase
        const browserType = getBrowser();

        const redirectUrl = browserType === 'chromium'
            ? chrome.identity.getRedirectURL()
            : browser.identity.getRedirectURL();

        const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                skipBrowserRedirect: true,
                redirectTo: redirectUrl,
                queryParams: {
                    access_type: 'offline',
                    prompt: 'consent',
                },
            },
        });

        if (error) throw error;
        if (!data?.url) throw new Error('No OAuth URL returned from Supabase');

        // 2. Route to browser-specific flow

        if (browserType === 'firefox') {
            await loginFirefox(data.url);
        } else {
            await loginChromium(data.url);
        }

        // 3. Return immediately - session will be captured by background listener
        // Popup should NOT wait here - it checks storage separately
        return { success: true };
    } catch (err: any) {
        console.error('[Auth] Login error:', err);
        return { success: false, error: err.message || 'Login failed' };
    }
}

/**
 * Logs out the current user.
 */
export async function logout(): Promise<void> {
    await supabase.auth.signOut();
    await browser.storage.local.remove('authSession');
}

/**
 * Initialize auth listeners. Call this once in background script main().
 */
export function initAuthListeners(): void {
    // Listen for OAuth redirects and capture session
    setupOAuthRedirectListener();

    // Listen for auth state changes from Supabase
    supabase.auth.onAuthStateChange(async (event, session) => {
        console.log('[Auth] Auth state changed:', event);
        if (session) {
            await browser.storage.local.set({ authSession: session });
            console.log('[Auth] Session stored from auth state change');
        } else if (event === 'SIGNED_OUT') {
            await browser.storage.local.remove('authSession');
        }
    });
}

// ============================================================================
// BROWSER-SPECIFIC FLOWS
// ============================================================================

/**
 * Chromium (Chrome, Edge, Brave) - Tab-based OAuth
 */
/**
 * Chromium (Chrome, Edge, Brave) - Identity Authenticated Flow
 * Uses launchWebAuthFlow to handle the virtual .chromiumapp.org domain correctly.
 */
async function loginChromium(url: string): Promise<void> {
    try {
        console.log('[Auth] Launching Web Auth Flow for Chromium');
        const redirectUrl = await chrome.identity.launchWebAuthFlow({
            url,
            interactive: true,
        });

        if (redirectUrl) {
            console.log('[Auth] Web Auth Flow completed. URL:', redirectUrl.substring(0, 50));
            // Check if it's a success callback
            if (redirectUrl.includes('access_token')) {
                await handleOAuthRedirect(redirectUrl);
            }
        }
    } catch (err: any) {
        console.error('[Auth] Chromium login error:', err);
        throw err;
    }
}

/**
 * Firefox - Identity API OAuth
 */
async function loginFirefox(url: string): Promise<void> {
    try {
        const redirectUrl = await browser.identity.launchWebAuthFlow({
            url,
            interactive: true,
        });

        // Firefox returns the redirect URL directly - extract tokens
        if (redirectUrl && redirectUrl.includes('access_token')) {
            await handleOAuthRedirect(redirectUrl);
        }
    } catch (err: any) {
        if (err.message?.includes('user')) {
            console.log('[Auth] User cancelled Firefox login');
        }
        throw err;
    }
}

// ============================================================================
// OAUTH REDIRECT CAPTURE (Chromium)
// ============================================================================

/**
 * Sets up listener to capture OAuth redirect and extract session.
 * Not strictly needed if launchWebAuthFlow is used, but kept as backup for some edge cases.
 */
function setupOAuthRedirectListener(): void {
    // With launchWebAuthFlow, we theoretically don't need this, 
    // but some older Chromiums might still use tab redirects.
    if (getBrowser() !== 'chromium') return;

    // Only set up for Chromium (Firefox uses identity API which returns URL directly)
    if (getBrowser() !== 'chromium') return;

    console.log('[Auth] Setting up webNavigation listener');

    chrome.webNavigation.onCompleted.addListener(async (details) => {
        const { url } = details;
        console.log('[Auth] webNavigation.onCompleted:', url.substring(0, 80));

        // Check if this is a Supabase OAuth callback
        if (url.includes('access_token') || url.includes('supabase.co/auth/v1/callback')) {
            console.log('[Auth] OAuth redirect detected:', url.substring(0, 50));
            await handleOAuthRedirect(url);

            // Close the OAuth tab
            if (details.tabId) {
                chrome.tabs.remove(details.tabId);
            }
        }
    });
}

/**
 * Extracts tokens from OAuth redirect URL and sets Supabase session.
 */
async function handleOAuthRedirect(url: string): Promise<void> {
    try {
        // Extract tokens from URL fragment (#access_token=...)
        const hashParams = new URLSearchParams(url.split('#')[1] || '');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken) {
            // Set session in Supabase client
            const { error } = await supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: refreshToken || '',
            });

            if (error) {
                console.error('[Auth] Failed to set session:', error);
                return;
            }

            // Get the full session and store it
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await browser.storage.local.set({ authSession: session });
                console.log('[Auth] Session captured and stored successfully');
            }
        }
    } catch (err) {
        console.error('[Auth] Error handling OAuth redirect:', err);
    }
}
