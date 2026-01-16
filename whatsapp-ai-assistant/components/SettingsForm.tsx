import React, { useState } from 'react';
import { Save, FileText, Check, Briefcase, Users, MessageCircle, Target, Scale, ChevronDown, Monitor } from 'lucide-react';
import type { Settings, ToneType } from '@/lib/types';
import { TONE_CONFIG } from '@/lib/types';

interface SettingsFormProps {
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  onTest?: (apiKey: string) => Promise<boolean>;
}

// Map icons
const ToneIcons: Record<ToneType, React.ReactNode> = {
  formal: <FileText size={20} />,
  friendly: <Users size={20} />,
  professional: <Briefcase size={20} />,
  natural: <MessageCircle size={20} />,
  sales: <Target size={20} />,
  negotiator: <Scale size={20} />,
};

// Map colors for grid items
const ToneStyles: Record<ToneType, { bg: string, border: string, iconColor: string, iconBg: string }> = {
  formal: { bg: 'bg-gray-50', border: 'border-gray-200', iconColor: 'text-gray-600', iconBg: 'bg-gray-100' },
  friendly: { bg: 'bg-yellow-50', border: 'border-yellow-200', iconColor: 'text-yellow-600', iconBg: 'bg-yellow-100' },
  professional: { bg: 'bg-blue-50', border: 'border-blue-200', iconColor: 'text-blue-600', iconBg: 'bg-blue-100' },
  natural: { bg: 'bg-green-50', border: 'border-green-200', iconColor: 'text-green-600', iconBg: 'bg-green-100' },
  sales: { bg: 'bg-orange-50', border: 'border-orange-200', iconColor: 'text-orange-600', iconBg: 'bg-orange-100' },
  negotiator: { bg: 'bg-purple-50', border: 'border-purple-200', iconColor: 'text-purple-600', iconBg: 'bg-purple-100' },
};

export const SettingsForm: React.FC<SettingsFormProps> = ({
  settings,
  onSave,
  onTest,
}) => {
  const [form, setForm] = useState<Settings>(settings);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  const tones: ToneType[] = ['formal', 'friendly', 'professional', 'natural', 'sales', 'negotiator'];

  return (
    <div className="p-5 space-y-6">
      {/* Extension Status */}
      <div className="flex items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <Monitor size={18} className="text-gray-500" />
          <span className="text-sm font-semibold text-gray-700">Extension Status</span>
        </div>
        <button
          onClick={() => setForm({ ...form, isEnabled: !form.isEnabled })}
          className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 focus:outline-none ${form.isEnabled ? 'bg-green-500' : 'bg-gray-300'
            }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-300 ${form.isEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
          />
        </button>
      </div>

      {/* Tone Selection Grid */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">Response Tone</label>
        <div className="grid grid-cols-2 gap-3">
          {tones.map((tone) => {
            const config = TONE_CONFIG[tone];
            const isSelected = form.tone === tone;
            const style = ToneStyles[tone];

            return (
              <button
                key={tone}
                onClick={() => setForm({ ...form, tone })}
                className={`relative flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 text-left hover:shadow-sm ${isSelected
                    ? `${style.bg} ${style.border} ring-1 ring-offset-0 ${style.border.replace('border', 'ring')}`
                    : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}
              >
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-white/80' : style.iconBg} ${style.iconColor}`}>
                  {ToneIcons[tone]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-bold ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                    {config.label}
                  </div>
                  <div className="text-[10px] text-gray-500 truncate mt-0.5">{config.description}</div>
                </div>
                {isSelected && (
                  <div className={`absolute top-2 right-2 ${style.iconColor}`}>
                    <Check size={14} strokeWidth={3} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Model Selection */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">AI Model</label>
        <div className="relative">
          <select
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value as Settings['model'] })}
            className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
          >
            <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Fast & Cheap)</option>
            <option value="gpt-4">GPT-4 (Better Quality)</option>
            <option value="gpt-4-turbo">GPT-4 Turbo (Best Balance)</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>
      </div>

      {/* Language */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">Language</label>
        <div className="relative">
          <select
            value={form.language}
            onChange={(e) => setForm({ ...form, language: e.target.value as Settings['language'] })}
            className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
          >
            <option value="en">English</option>
            <option value="ur">Urdu</option>
            <option value="mixed">Mixed (English + Urdu)</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-all shadow-md shadow-green-500/20 active:scale-[0.99] disabled:opacity-70 disabled:active:scale-100 mt-2"
      >
        <Save size={18} />
        {saving ? 'Saving...' : 'Save Settings'}
      </button>

      {/* Privacy Notice */}
      <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4 text-xs text-gray-600 leading-relaxed text-center">
        <span className="font-bold text-yellow-700 block mb-1">⚠️ Privacy Notice</span>
        Messages are sent to OpenAI for AI processing using your API key.
        Don't use for highly confidential conversations.
      </div>
    </div>
  );
};
