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
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                onLoginSuccess();
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
        // Open website auth page
        const extensionId = browser.runtime.id;
        await browser.tabs.create({
            url: `https://repleai.site/extension/welcome?extensionId=${extensionId}&source=popup`
        });

        // Use window.close() after a short delay since tab creation is async
        setTimeout(() => {
            window.close();
        }, 500);
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
