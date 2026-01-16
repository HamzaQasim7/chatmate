import type { Settings } from './types';

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'gpt-3.5-turbo',
  language: 'en',
  isEnabled: true,
  tone: 'professional',
};

export async function getSettings(): Promise<Settings> {
  const result = await browser.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...result.settings };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await browser.storage.local.set({ settings });
}

export async function isExtensionEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return settings.isEnabled;
}
