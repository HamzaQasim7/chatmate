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
        try {
            setLoading(true);
            setError(null);

            // 1. Get the OAuth URL from Supabase
            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    },
                    redirectTo: browser.identity.getRedirectURL(),
                    skipBrowserRedirect: true,
                },
            });

            if (error) throw error;
            if (!data?.url) throw new Error('No OAuth URL returned');

            // 2. Launch Web Auth Flow
            const redirectUrl = await browser.identity.launchWebAuthFlow({
                url: data.url,
                interactive: true,
            });

            if (redirectUrl) {
                // 3. Parse the URL to get the session (access_token, refresh_token)
                // The URL will look like: https://<id>.chromiumapp.org/#access_token=...&refresh_token=...
                const params = new URLSearchParams(redirectUrl.split('#')[1]);
                const accessToken = params.get('access_token');
                const refreshToken = params.get('refresh_token');

                if (accessToken) {
                    const { error: sessionError } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken || '',
                    });
                    if (sessionError) throw sessionError;

                    onLoginSuccess();
                } else {
                    throw new Error('No access token found in redirect URL');
                }
            }
        } catch (err: any) {
            console.error('Login error:', err);
            setError(err.message || 'Failed to login');
            setLoading(false);
        }
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
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00f592] focus:border-transparent text-sm"
                        />
                    </div>
                    <div>
                        <input
                            type="password"
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-[#00f592] focus:border-transparent text-sm"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-[#00f592] hover:bg-[#00d680] text-slate-900 font-bold py-2.5 px-4 rounded-lg transition-all shadow-sm flex items-center justify-center text-sm"
                    >
                        {loading && <Loader2 className="animate-spin mr-2" size={16} />}
                        {view === 'signin' ? 'Sign In' : 'Sign Up'}
                    </button>
                </form>

                <div className="text-xs text-slate-500">
                    {view === 'signin' ? "Don't have an account? " : "Already have an account? "}
                    <button
                        onClick={() => setView(view === 'signin' ? 'signup' : 'signin')}
                        className="text-[#00d680] font-semibold hover:underline"
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
