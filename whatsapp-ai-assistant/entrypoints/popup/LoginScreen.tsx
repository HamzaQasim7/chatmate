import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

interface LoginScreenProps {
    onLoginSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [view, setView] = useState<'signin' | 'signup'>('signin');
    const [message, setMessage] = useState<string | null>(null);

    useEffect(() => {
        // Check if already logged in
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                onLoginSuccess();
            }
        });
    }, [onLoginSuccess]);

    const handleGoogleLogin = async () => {
        setLoading(true);
        setError(null);
        setMessage('Opening Google Sign-In...');

        // Trigger OAuth in background (opens new tab)
        console.log('[LoginScreen] Sending loginWithGoogle message to background');
        await browser.runtime.sendMessage({ action: 'loginWithGoogle' });

        // OAuth opens in new tab - popup should poll for session
        // Show friendly message instead of expecting immediate result
        setMessage('Finishing sign-in... you can close this window if it takes too long.');

        // Poll storage for session (background will store it after OAuth completes)
        const maxAttempts = 30;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise((r) => setTimeout(r, 1000));

            // Check storage for session
            const { authSession } = await browser.storage.local.get('authSession');
            console.log(`[LoginScreen] Poll ${i + 1}: Storage:`, authSession ? 'FOUND' : 'none');
            if (authSession) {
                setMessage(null);
                onLoginSuccess();
                return;
            }

            // Also check Supabase directly
            const { data: { session } } = await supabase.auth.getSession();
            console.log(`[LoginScreen] Poll ${i + 1}: Supabase:`, session ? 'FOUND' : 'none');
            if (session) {
                await browser.storage.local.set({ authSession: session });
                setMessage(null);
                onLoginSuccess();
                return;
            }
        }

        // Timeout - but don't show error, session might still appear
        setMessage('Sign-in is taking longer than expected. Please try again.');
        setLoading(false);
    };

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMessage(null);

        try {
            if (view === 'signup') {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                });
                if (error) throw error;
                setMessage('Check your email for the confirmation link!');
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });
                if (error) throw error;
                onLoginSuccess();
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
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
                {/* Google Login */}
                <button
                    onClick={handleGoogleLogin}
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium py-2.5 px-4 rounded-lg transition-all shadow-sm"
                >
                    {loading ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : (
                        <img
                            src="https://www.google.com/favicon.ico"
                            alt="Google"
                            className="w-5 h-5"
                        />
                    )}
                    {loading ? 'Connecting...' : 'Continue with Google'}
                </button>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-300" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-slate-50 px-2 text-slate-500">Or continue with</span>
                    </div>
                </div>

                {/* Email Form */}
                <form onSubmit={handleEmailAuth} className="space-y-3 text-left">
                    <div>
                        <input
                            type="email"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#13ec5b] focus:border-transparent text-sm"
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#13ec5b] focus:border-transparent text-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#13ec5b] hover:bg-[#13ec5b] text-slate-900 font-bold py-2.5 px-4 rounded-lg transition-all shadow-sm flex items-center justify-center text-sm"
                    >
                        {loading && <Loader2 className="animate-spin mr-2" size={16} />}
                        {view === 'signin' ? 'Sign In' : 'Sign Up'}
                    </button>
                </form>

                <div className="text-xs text-slate-500">
                    {view === 'signin' ? "Don't have an account? " : "Already have an account? "}
                    <button
                        onClick={() => setView(view === 'signin' ? 'signup' : 'signin')}
                        className="text-[#13ec5b] font-semibold hover:underline"
                    >
                        {view === 'signin' ? 'Sign up' : 'Sign in'}
                    </button>
                </div>

                {message && (
                    <p className="text-xs text-green-600 bg-green-50 p-2 rounded border border-green-200">
                        {message}
                    </p>
                )}

                {error && (
                    <p className="text-xs text-red-500 bg-red-50 p-2 rounded border border-red-100">
                        {error}
                    </p>
                )}
            </div>

            <p className="text-xs text-slate-400 mt-8">
                By continuing, you verify that you are a real human.
            </p>
        </div>
    );
};
