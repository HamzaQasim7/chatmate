import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, ExternalLink } from 'lucide-react';

interface LoginScreenProps {
    onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // Check if already logged in (polling for session from website)
        const checkSession = async () => {
            // 1. Standard Supabase Check
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                onLoginSuccess();
                return;
            }

            // 2. Fallback: Check local storage backup from background script
            try {
                const stored = await browser.storage.local.get('authSession');
                if (stored.authSession) {
                    const { data, error } = await supabase.auth.setSession({
                        access_token: stored.authSession.access_token,
                        refresh_token: stored.authSession.refresh_token,
                    });

                    if (!error && data.session) {
                        onLoginSuccess();
                        return;
                    }
                }
            } catch {
                // Silent fail
            }

            // 3. NEW: Poll Supabase for pending auth (cross-origin bridge)
            try {
                const extensionId = browser.runtime.id;
                const { data: pendingAuth, error } = await supabase
                    .from('pending_extension_auth')
                    .select('session_data')
                    .eq('extension_id', extensionId)
                    .single();

                if (!error && pendingAuth?.session_data) {
                    const sessionData = pendingAuth.session_data;

                    // Try to set session
                    const { data, error: authError } = await supabase.auth.setSession({
                        access_token: sessionData.access_token,
                        refresh_token: sessionData.refresh_token,
                    });

                    if (!authError && data.session) {
                        // Save to backup storage
                        await browser.storage.local.set({ authSession: sessionData });

                        // Delete the pending auth row (cleanup)
                        await supabase
                            .from('pending_extension_auth')
                            .delete()
                            .eq('extension_id', extensionId);

                        onLoginSuccess();
                        return;
                    }
                }
            } catch {
                // Silent fail - table might not exist yet
            }
        };

        // Initial check
        checkSession();

        // Poll every 2 seconds
        const interval = setInterval(checkSession, 2000);
        return () => clearInterval(interval);
    }, [onLoginSuccess]);

    const handleWebLogin = async () => {
        setLoading(true);
        const extensionId = browser.runtime.id;
        await browser.tabs.create({
            url: `https://repleai.site/extension/welcome?extensionId=${extensionId}&source=popup`
        });
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[500px] p-6 text-center space-y-6 bg-slate-50">
            <div className="space-y-3 flex flex-col items-center">
                <img src="/reple-favicon.png" alt="Reple" className="w-16 h-16 object-contain" />
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Welcome to Reple</h1>
                    <p className="text-sm text-slate-500">Sign in to sync your usage & preferences</p>
                </div>
            </div>

            <div className="w-full max-w-xs space-y-4">
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <p className="text-slate-600 mb-4 text-sm">
                        Authentication is now handled on our secure website.
                    </p>

                    <button
                        onClick={handleWebLogin}
                        disabled={loading}
                        className="w-full bg-[#13ec5b] hover:bg-[#10c44b] text-slate-900 font-bold py-3 px-4 rounded-lg transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 group"
                    >
                        {loading ? (
                            <Loader2 className="animate-spin" size={20} />
                        ) : (
                            <>
                                <span>Sign In / Sign Up</span>
                                <ExternalLink size={16} className="text-slate-800 group-hover:translate-x-0.5 transition-transform" />
                            </>
                        )}
                    </button>

                    <p className="text-xs text-slate-400 mt-3">
                        Opens in a new tab
                    </p>
                </div>

                <div className="text-xs text-slate-500 pt-4">
                    <p>Having trouble?</p>
                    <a href="mailto:support@repleai.site" className="text-[#13ec5b] hover:underline">Contact Support</a>
                </div>
            </div>

            <p className="text-xs text-slate-400 mt-auto">
                By continuing, you agree to our Terms & Privacy Policy.
            </p>
        </div>
    );
};
