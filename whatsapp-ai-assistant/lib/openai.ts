import OpenAI from 'openai';

export async function testAPIKey(apiKey: string): Promise<boolean> {
  if (!apiKey || !apiKey.startsWith('sk-')) {
    return false;
  }

  try {
    const openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true,
    });

    // Simple test call to verify API key
    await openai.models.list();
    return true;
  } catch (error) {
    console.error('API key test failed:', error);
    return false;
  }
}

export function validateAPIKey(apiKey: string): boolean {
  return apiKey.startsWith('sk-') && apiKey.length > 20;
}
