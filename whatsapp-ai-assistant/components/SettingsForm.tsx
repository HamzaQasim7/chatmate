import React, { useState } from 'react';
import { Save, Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import type { Settings } from '@/lib/types';

interface SettingsFormProps {
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  onTest: (apiKey: string) => Promise<boolean>;
}

export const SettingsForm: React.FC<SettingsFormProps> = ({
  settings,
  onSave,
  onTest,
}) => {
  const [form, setForm] = useState<Settings>(settings);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await onTest(form.apiKey);
    setTestResult(result);
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="p-4 space-y-4">
      {/* Extension Status */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Extension Status</span>
        <button
          onClick={() => setForm({ ...form, isEnabled: !form.isEnabled })}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
            form.isEnabled ? 'bg-whatsapp-green' : 'bg-gray-300'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              form.isEnabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-sm font-medium mb-1">OpenAI API Key</label>
        <div className="relative">
          <input
            type={showApiKey ? 'text' : 'password'}
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm pr-20"
          />
          <button
            onClick={() => setShowApiKey(!showApiKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
          >
            {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <button
          onClick={handleTest}
          disabled={!form.apiKey || testing}
          className="mt-2 text-xs text-whatsapp-green hover:underline disabled:text-gray-400"
        >
          {testing ? 'Testing...' : 'Test Connection'}
        </button>
        {testResult !== null && (
          <div className={`flex items-center gap-1 mt-1 text-xs ${testResult ? 'text-green-600' : 'text-red-600'}`}>
            {testResult ? <CheckCircle size={14} /> : <XCircle size={14} />}
            {testResult ? 'API key is valid' : 'Invalid API key'}
          </div>
        )}
      </div>

      {/* Model Selection */}
      <div>
        <label className="block text-sm font-medium mb-1">AI Model</label>
        <select
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value as Settings['model'] })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Fast & Cheap)</option>
          <option value="gpt-4">GPT-4 (Better Quality)</option>
          <option value="gpt-4-turbo">GPT-4 Turbo (Best Balance)</option>
        </select>
      </div>

      {/* Language */}
      <div>
        <label className="block text-sm font-medium mb-1">Language</label>
        <select
          value={form.language}
          onChange={(e) => setForm({ ...form, language: e.target.value as Settings['language'] })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
        >
          <option value="en">English</option>
          <option value="ur">Urdu</option>
          <option value="mixed">Mixed (English + Urdu)</option>
        </select>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-whatsapp-green text-white rounded-md font-medium hover:bg-whatsapp-dark transition-colors disabled:bg-gray-400"
      >
        <Save size={16} />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {/* Privacy Notice */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-xs text-gray-700">
        ⚠️ <strong>Privacy Notice:</strong> Messages are sent to OpenAI for AI processing using your API key. 
        Don't use for highly confidential conversations.
      </div>
    </div>
  );
};
