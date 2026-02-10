import type { Settings, UsageStats } from './types';

// Helper to safely access browser storage
function getStorageAPI() {
  const g = globalThis as any;
  const b = g.browser || g.chrome;
  // Check if runtime is valid (prevents context invalidated errors)
  if (!b?.runtime?.id) return null;

  if (!b?.storage?.local) {
    // console.log('[Storage] Browser storage API not available');
    return null;
  }
  return b.storage.local;
}

const DEFAULT_USAGE: UsageStats = {
  count: 0,
  limit: 20,
  lastReset: Date.now(),
};

const DEFAULT_SETTINGS: Settings = {
  provider: 'openai',
  apiKey: '',
  model: 'reple-smart',
  language: 'en',
  isEnabled: true,
  tone: 'professional',
  contextWindow: 5,
};

export async function getSettings(): Promise<Settings> {
  const storage = getStorageAPI();
  if (!storage) return DEFAULT_SETTINGS;

  try {
    const result = await storage.get('settings');
    return { ...DEFAULT_SETTINGS, ...result.settings };
  } catch (e) {
    console.warn('[Storage] Error getting settings:', e);
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const storage = getStorageAPI();
  if (!storage) return;

  try {
    await storage.set({ settings });
  } catch (e) {
    console.warn('[Storage] Error saving settings:', e);
  }
}

export async function isExtensionEnabled(): Promise<boolean> {
  const settings = await getSettings();
  return settings.isEnabled;
}

export async function getUsageStats(): Promise<UsageStats> {
  const storage = getStorageAPI();
  if (!storage) return DEFAULT_USAGE;

  try {
    const result = await storage.get('usageStats');
    return { ...DEFAULT_USAGE, ...result.usageStats };
  } catch (e) {
    console.warn('[Storage] Error getting usage stats:', e);
    return DEFAULT_USAGE;
  }
}

export async function saveUsageStats(stats: UsageStats): Promise<void> {
  const storage = getStorageAPI();
  if (!storage) return;

  try {
    await storage.set({ usageStats: stats });
  } catch (e) {
    console.warn('[Storage] Error saving usage stats:', e);
  }
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
