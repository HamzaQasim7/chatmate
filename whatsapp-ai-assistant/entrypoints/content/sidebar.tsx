import React, { useState, useEffect, useImperativeHandle, forwardRef } from 'react';
import { createRoot } from 'react-dom/client';
import { X, RefreshCw } from 'lucide-react';
import { SuggestionCard } from '@/components/SuggestionCard';
import { insertTextToWhatsApp } from '@/lib/whatsapp';
import type { Suggestion } from '@/lib/types';

interface SidebarHandle {
  update: (action: string, data: any) => void;
}

const Sidebar = forwardRef<SidebarHandle>((_props, ref) => {
  const [visible, setVisible] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastMessage, setLastMessage] = useState('');

  useImperativeHandle(ref, () => ({
    update: (action: string, data: any) => {
      if (action === 'showSuggestions') {
        setSuggestions(data.suggestions || []);
        setLastMessage(data.message || '');
        setVisible(true);
        setLoading(false);
      } else if (action === 'loading') {
        setLoading(true);
        setVisible(true);
      }
    },
  }));

  useEffect(() => {
    // Also listen for messages from background script (for regeneration)
    const listener = (message: any) => {
      if (message.action === 'showSuggestions') {
        setSuggestions(message.suggestions || []);
        setLastMessage(message.message || '');
        setVisible(true);
        setLoading(false);
      } else if (message.action === 'loading') {
        setLoading(true);
        setVisible(true);
      }
    };

    browser.runtime.onMessage.addListener(listener);

    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    // Show feedback
    const notification = document.createElement('div');
    notification.textContent = 'Copied to clipboard!';
    notification.className = 'fixed top-4 right-4 bg-green-500 text-white px-4 py-2 rounded shadow-lg z-[10000]';
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
  };

  const handleInsert = (text: string) => {
    insertTextToWhatsApp(text);
  };

  const handleRegenerate = async () => {
    setLoading(true);
    try {
      // Send request to background script
      const response = await browser.runtime.sendMessage({ action: 'regenerate' });
      if (response?.suggestions) {
        setSuggestions(response.suggestions);
        setLoading(false);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error regenerating suggestions:', error);
      setLoading(false);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed right-0 top-0 w-[350px] h-screen bg-white shadow-2xl z-[9999] flex flex-col animate-slide-in">
      {/* Header */}
      <div className="bg-whatsapp-green text-white p-4 flex items-center justify-between">
        <h2 className="text-lg font-bold">💬 AI Suggestions</h2>
        <button
          onClick={() => setVisible(false)}
          className="hover:bg-whatsapp-dark p-1 rounded transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Last Message Preview */}
        <div className="bg-gray-100 rounded-lg p-3 mb-4">
          <p className="text-xs font-medium text-gray-600 mb-1">Last Message:</p>
          <p className="text-sm text-gray-800">{lastMessage || 'Waiting for messages...'}</p>
        </div>

        {/* Suggestions */}
        <div className="space-y-3">
          {loading ? (
            <>
              <SuggestionCard suggestion={null} loading onCopy={() => {}} onInsert={() => {}} />
              <SuggestionCard suggestion={null} loading onCopy={() => {}} onInsert={() => {}} />
              <SuggestionCard suggestion={null} loading onCopy={() => {}} onInsert={() => {}} />
            </>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                onCopy={handleCopy}
                onInsert={handleInsert}
              />
            ))
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              No suggestions yet. Waiting for incoming messages...
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <button
          onClick={handleRegenerate}
          disabled={loading || suggestions.length === 0}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md font-medium hover:bg-gray-200 transition-colors disabled:bg-gray-50 disabled:text-gray-400"
        >
          <RefreshCw size={16} />
          Regenerate
        </button>
      </div>
    </div>
  );
});

Sidebar.displayName = 'Sidebar';

// Export function to mount sidebar
export function mountSidebar(container: HTMLElement) {
  const root = createRoot(container);
  const ref = React.createRef<SidebarHandle>();
  root.render(<Sidebar ref={ref} />);
  
  return {
    root,
    update: (action: string, data: any) => {
      if (ref.current) {
        ref.current.update(action, data);
      }
    },
  };
}

export default Sidebar;
