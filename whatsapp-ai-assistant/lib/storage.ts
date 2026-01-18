import type { Settings, UsageStats } from './types';

const DEFAULT_USAGE: UsageStats = {
  count: 0,
  lastReset: Date.now(),
};

const DEFAULT_SETTINGS: Settings = {
  apiKey: '',
  model: 'reple-smart',
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

export async function getUsageStats(): Promise<UsageStats> {
  const result = await browser.storage.local.get('usageStats');
  return { ...DEFAULT_USAGE, ...result.usageStats };
}

export async function saveUsageStats(stats: UsageStats): Promise<void> {
  await browser.storage.local.set({ usageStats: stats });
}

export async function checkAndResetUsage(): Promise<UsageStats> {
  const stats = await getUsageStats();
  const now = new Date();
  const lastResetDate = new Date(stats.lastReset);

  // Check if it's a new month
  if (now.getMonth() !== lastResetDate.getMonth() || now.getFullYear() !== lastResetDate.getFullYear()) {
    const newStats = { count: 0, lastReset: Date.now() };
    await saveUsageStats(newStats);
    return newStats;
  }
  return stats;
}

export async function incrementUsage(): Promise<void> {
  const stats = await checkAndResetUsage();
  stats.count += 1;
  await saveUsageStats(stats);
}
