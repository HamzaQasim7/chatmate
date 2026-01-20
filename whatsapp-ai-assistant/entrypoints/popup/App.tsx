import { useState, useEffect } from 'react';
import { SettingsForm } from '@/components/SettingsForm';
import { getSettings, saveSettings } from '@/lib/storage';
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
    badge.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg z-50 animate-fade-in';
    document.body.appendChild(badge);
    setTimeout(() => badge.remove(), 2000);
  };

  if (!settings) {
    return (
      <div className="w-full h-96 flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#00f592' }}></div>
      </div>
    );
  }

  return (
    <div className="w-full h-[600px] overflow-y-auto bg-gray-50 font-sans">
      {/* Reple Header - Clean Modern Style */}
      <div className="bg-white border-b border-gray-100 p-5 sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <img
            src="/reple-favicon.png"
            alt="Reple"
            className="w-10 h-10 object-contain drop-shadow-md"
          />
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              Reple
            </h1>
            <p className="text-xs font-medium text-gray-500 mt-0.5">AI Response Assistant</p>
          </div>
        </div>
      </div>

      <SettingsForm settings={settings} onSave={handleSave} />
    </div>
  );
}
