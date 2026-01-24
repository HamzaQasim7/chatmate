import { supabase } from '@/lib/supabase';

interface GenerateReplyParams {
    messages: { role: string; content: string }[];
    tone?: string;
    prompt?: string;
}

export const generateReply = async (params: GenerateReplyParams): Promise<{ reply: string; usage?: number; limit?: number }> => {
    // 1. Check Session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        throw new Error('Please sign in to generate replies.');
    }

    // 2. Call Edge Function
    const { data, error } = await supabase.functions.invoke('generate-reply', {
        body: params,
    });

    if (error) {
        console.error('Edge Function Error:', error);

        // Handle Limit Exceeded specifically
        if (error.context?.status === 402 || error.status === 402) {
            throw new Error('Usage limit reached. Please upgrade to Pro.');
        }

        throw new Error(error.message || 'Failed to generate reply');
    }

    return {
        reply: data.reply,
        usage: data.usage,
        limit: data.limit
    };
};
