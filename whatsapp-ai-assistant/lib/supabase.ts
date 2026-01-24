import { createClient } from '@supabase/supabase-js';
import { browser } from 'wxt/browser';

// NOTE: Ideally these should be in an .env file or build Config
// For extension build, we sometimes need to hardcode specific client keys (SAFE to expose KEY)
// NEVER expose the SERVICE_ROLE_KEY here. Only the ANON KEY.

// @ts-ignore: WXT uses vite which supports import.meta.env
const SUPABASE_URL = import.meta.env.WXT_SUPABASE_URL;
// @ts-ignore: WXT uses vite which supports import.meta.env
const SUPABASE_ANON_KEY = import.meta.env.WXT_SUPABASE_ANON_KEY;

const storageAdapter = {
    getItem: async (key: string): Promise<string | null> => {
        const result = await browser.storage.local.get([key]);
        return (result[key] as string) || null;
    },
    setItem: async (key: string, value: string) => {
        await browser.storage.local.set({ [key]: value });
    },
    removeItem: async (key: string) => {
        await browser.storage.local.remove(key);
    },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
        storage: storageAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
    },
});
