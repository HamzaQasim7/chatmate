import React, { useState } from 'react';
import { Save, Check, Briefcase, Users, MessageCircle, Target, Scale, ChevronDown, Monitor, ClipboardList } from 'lucide-react';
import type { Settings, ToneType } from '@/lib/types';
import { TONE_CONFIG, MODEL_CONFIG } from '@/lib/types';

interface SettingsFormProps {
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
}

// Map icons
const ToneIcons: Record<ToneType, React.ReactNode> = {
  formal: <ClipboardList size={22} />,
  friendly: <Users size={22} />,
  professional: <Briefcase size={22} />,
  natural: <MessageCircle size={22} />,
  sales: <Target size={22} />,
  negotiator: <Scale size={22} />,
};

// Map colors for grid items
const ToneStyles: Record<ToneType, { bg: string, border: string, iconColor: string, iconBg: string }> = {
  formal: { bg: 'bg-blue-50', border: 'border-blue-100', iconColor: 'text-blue-600', iconBg: 'bg-blue-100' },
  friendly: { bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-600', iconBg: 'bg-emerald-100' },
  professional: { bg: 'bg-slate-50', border: 'border-slate-200', iconColor: 'text-slate-600', iconBg: 'bg-slate-100' },
  natural: { bg: 'bg-violet-50', border: 'border-violet-200', iconColor: 'text-violet-600', iconBg: 'bg-violet-100' },
  sales: { bg: 'bg-rose-50', border: 'border-rose-200', iconColor: 'text-rose-600', iconBg: 'bg-rose-100' },
  negotiator: { bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-600', iconBg: 'bg-amber-100' },
};

export const SettingsForm: React.FC<SettingsFormProps> = ({
  settings,
  onSave,
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
      {/* API Key Section */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <label className="block text-sm font-bold text-gray-800 mb-2">
          OpenAI API Key <span className="text-gray-400 font-normal">(Optional)</span>
        </label>
        <input
          type="password"
          value={form.apiKey || ''}
          onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
          placeholder="sk-..."
          className="w-full px-4 py-2.5 bg-white border border-blue-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono"
        />
        <div className="mt-2 text-xs flex items-center gap-2">
          {form.apiKey ? (
            <span className="text-green-600 font-semibold flex items-center gap-1">
              <Check size={12} /> Unlimited Usage Unlocked
            </span>
          ) : (
            <span className="text-blue-600 font-medium">
              ℹ️ Using Free Tier (20 responses/month)
            </span>
          )}
        </div>
      </div>

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
                className={`relative flex flex-col items-start gap-2 p-4 rounded-3xl border transition-all duration-200 text-left hover:shadow-md h-full ${isSelected
                  ? `${style.bg} ${style.border} ring-2 ring-emerald-400`
                  : 'bg-white border-gray-100 hover:border-gray-200 shadow-sm'
                  }`}
              >
                <div className="flex justify-between w-full items-start">
                  <div className={`p-2.5 rounded-full ${isSelected ? 'bg-white' : style.iconBg} ${style.iconColor}`}>
                    {ToneIcons[tone]}
                  </div>
                  {isSelected && (
                    <div className="bg-emerald-500 text-white rounded-full p-1">
                      <Check size={12} strokeWidth={4} />
                    </div>
                  )}
                </div>

                <div className="mt-1">
                  <div className="text-[13px] font-bold text-gray-900 leading-tight mb-0.5">
                    {config.label}
                  </div>
                  <div className="text-[11px] text-gray-500 font-medium leading-snug">
                    {config.description}
                  </div>
                </div>
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
            onChange={(e) => setForm({ ...form, model: e.target.value as any })}
            className="w-full pl-4 pr-10 py-3 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
          >
            {(Object.keys(MODEL_CONFIG) as Array<keyof typeof MODEL_CONFIG>).map((key) => {
              const config = MODEL_CONFIG[key];
              const isLocked = config.isPro && !form.apiKey;

              return (
                <option key={key} value={key} disabled={isLocked}>
                  {config.label} - {config.description} {isLocked ? '(Requires API Key)' : ''}
                </option>
              );
            })}
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


    </div>
  );
};
