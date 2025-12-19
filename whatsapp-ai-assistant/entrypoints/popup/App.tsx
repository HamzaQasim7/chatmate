import React, { useEffect, useState } from 'react';
import { SettingsForm } from '@/components/SettingsForm';
import { getSettings, saveSettings } from '@/lib/storage';
import { testAPIKey } from '@/lib/openai';
import type { Settings } from '@/lib/types';
import './style.css';

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const data = await getSettings();
    setSettings(data);
  };

  const handleSave = async (newSettings: Settings) => {
    await saveSettings(newSettings);
    setSettings(newSettings);
    // Show success message
    const badge = document.createElement('div');
    badge.textContent = '✓ Saved successfully';
    badge.className = 'fixed top-2 right-2 bg-green-500 text-white px-3 py-1 rounded text-sm z-50';
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 2000);
  };

  if (!settings) {
    return (
      <div className="w-80 h-96 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-whatsapp-green"></div>
      </div>
    );
  }

  return (
    <div className="w-80 max-h-[600px] overflow-y-auto">
      <div className="bg-whatsapp-green text-white p-4">
        <h1 className="text-lg font-bold">💬 WhatsApp AI Assistant</h1>
        <p className="text-xs opacity-90 mt-1">Configure your AI-powered suggestions</p>
      </div>
      <SettingsForm settings={settings} onSave={handleSave} onTest={testAPIKey} />
    </div>
  );
}
