import { useState, useEffect, useRef, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Sparkles,
  Quote,
  ChevronDown,
  RefreshCw,
  Copy,
  Check,
  CheckCircle,
  X,
  MessageSquare,
  Briefcase,
  Users,
  MessageCircle,
  Target,
  Scale,
  FileText,
  Loader2,
  Sun,
  Moon,
  GripVertical
} from 'lucide-react';
import { insertTextToWhatsApp } from '@/lib/whatsapp';
import { getSettings, saveSettings } from '@/lib/storage';
import type { Suggestion, ToneType, Settings } from '@/lib/types';
import { TONE_CONFIG } from '@/lib/types';

let sidebarUpdateFn: ((action: string, data: any) => void) | null = null;

// Icon components for tones
const ToneIcons: Record<ToneType, React.ReactNode> = {
  formal: <FileText size={14} />,
  friendly: <Users size={14} />,
  professional: <Briefcase size={14} />,
  natural: <MessageCircle size={14} />,
  sales: <Target size={14} />,
  negotiator: <Scale size={14} />,
};

// Tone colors (work for both themes)
const toneColors: Record<ToneType, { bg: string; border: string; text: string }> = {
  formal: { bg: 'rgba(142, 142, 147, 0.15)', border: 'rgba(142, 142, 147, 0.3)', text: '#8E8E93' },
  friendly: { bg: 'rgba(255, 204, 0, 0.15)', border: 'rgba(255, 204, 0, 0.3)', text: '#B8860B' },
  professional: { bg: 'rgba(0, 122, 255, 0.15)', border: 'rgba(0, 122, 255, 0.25)', text: '#007AFF' },
  natural: { bg: 'rgba(52, 199, 89, 0.15)', border: 'rgba(52, 199, 89, 0.25)', text: '#34C759' },
  sales: { bg: 'rgba(255, 149, 0, 0.15)', border: 'rgba(255, 149, 0, 0.25)', text: '#FF9500' },
  negotiator: { bg: 'rgba(175, 82, 222, 0.15)', border: 'rgba(175, 82, 222, 0.25)', text: '#AF52DE' },
};

const toneList: ToneType[] = ['formal', 'friendly', 'professional', 'natural', 'sales', 'negotiator'];

// Theme styles
const themes = {
  light: {
    panelBg: 'rgba(255, 255, 255, 0.95)',
    panelBorder: 'rgba(0, 0, 0, 0.08)',
    panelShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.15)',
    headerBorder: 'rgba(0, 0, 0, 0.06)',
    titleColor: '#1D1D1F',
    closeBtnBg: 'rgba(0, 0, 0, 0.05)',
    closeBtnColor: '#8E8E93',
    messagePreviewBg: 'rgba(0, 0, 0, 0.03)',
    messagePreviewBorder: 'rgba(0, 0, 0, 0.04)',
    quoteColor: '#8E8E93',
    messageTextColor: '#6E6E73',
    responseCardBg: '#FFFFFF',
    responseCardBorder: 'rgba(0, 0, 0, 0.08)',
    responseTextColor: '#1D1D1F',
    actionsBarBg: 'rgba(0, 0, 0, 0.02)',
    actionsBarBorder: 'rgba(0, 0, 0, 0.06)',
    regenBtnBg: 'rgba(0, 0, 0, 0.04)',
    regenBtnColor: '#8E8E93',
    dividerColor: 'rgba(0, 0, 0, 0.1)',
    copyBtnBg: '#FFFFFF',
    copyBtnBorder: 'rgba(0, 0, 0, 0.12)',
    copyBtnColor: '#3C3C43',
    loadingTextColor: '#8E8E93',
    themeBtnBg: 'rgba(0, 0, 0, 0.05)',
    themeBtnColor: '#8E8E93',
    dropdownBg: 'rgba(255, 255, 255, 0.98)',
    dropdownBorder: 'rgba(0, 0, 0, 0.1)',
    optionHoverBg: 'rgba(0, 0, 0, 0.04)',
    optionTextColor: '#1D1D1F',
  },
  dark: {
    panelBg: 'rgba(28, 28, 30, 0.95)',
    panelBorder: 'rgba(255, 255, 255, 0.1)',
    panelShadow: '0 10px 40px -10px rgba(0, 0, 0, 0.5)',
    headerBorder: 'rgba(255, 255, 255, 0.06)',
    titleColor: '#FFFFFF',
    closeBtnBg: 'rgba(255, 255, 255, 0.08)',
    closeBtnColor: 'rgba(255, 255, 255, 0.6)',
    messagePreviewBg: 'rgba(255, 255, 255, 0.04)',
    messagePreviewBorder: 'rgba(255, 255, 255, 0.05)',
    quoteColor: 'rgba(255, 255, 255, 0.3)',
    messageTextColor: 'rgba(255, 255, 255, 0.5)',
    responseCardBg: 'rgba(255, 255, 255, 0.06)',
    responseCardBorder: 'rgba(255, 255, 255, 0.08)',
    responseTextColor: 'rgba(255, 255, 255, 0.9)',
    actionsBarBg: 'rgba(0, 0, 0, 0.15)',
    actionsBarBorder: 'rgba(255, 255, 255, 0.06)',
    regenBtnBg: 'rgba(255, 255, 255, 0.06)',
    regenBtnColor: 'rgba(255, 255, 255, 0.5)',
    dividerColor: 'rgba(255, 255, 255, 0.1)',
    copyBtnBg: 'rgba(255, 255, 255, 0.06)',
    copyBtnBorder: 'rgba(255, 255, 255, 0.12)',
    copyBtnColor: 'rgba(255, 255, 255, 0.8)',
    loadingTextColor: 'rgba(255, 255, 255, 0.5)',
    themeBtnBg: 'rgba(255, 255, 255, 0.08)',
    themeBtnColor: 'rgba(255, 255, 255, 0.6)',
    dropdownBg: 'rgba(44, 44, 46, 0.98)',
    dropdownBorder: 'rgba(255, 255, 255, 0.1)',
    optionHoverBg: 'rgba(255, 255, 255, 0.05)',
    optionTextColor: 'rgba(255, 255, 255, 0.8)',
  },
};

function FloatingPopup() {
  const [expanded, setExpanded] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastMessage, setLastMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentTone, setCurrentTone] = useState<ToneType>('professional');
  const [showToneDropdown, setShowToneDropdown] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [isDark, setIsDark] = useState(true);

  // Drag state
  const [position, setPosition] = useState({ x: 0, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const theme = isDark ? themes.dark : themes.light;

  useEffect(() => {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes fadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
      @keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.05); } }
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    `;
    document.head.appendChild(styleSheet);
    getSettings().then(settings => setCurrentTone(settings.tone));

    // Center horizontally on load
    const centerX = (window.innerWidth - 420) / 2;
    setPosition({ x: centerX, y: 80 });

    return () => { document.head.removeChild(styleSheet); };
  }, []);

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.startPosX + deltaX,
        y: dragRef.current.startPosY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  useEffect(() => {
    sidebarUpdateFn = (action: string, data: any) => {
      if (action === 'showSuggestions') {
        const suggestions = data.suggestions || [];
        setSuggestion(suggestions[0] || null);
        setLastMessage(data.message || '');
        setLoading(false);
        setScanning(false);
        setError(data.error || null);
        if (suggestions.length > 0) {
          setExpanded(true);
          setHasNew(false);
          if (suggestions[0]?.type) setCurrentTone(suggestions[0].type);
        }
      } else if (action === 'loading') {
        setLoading(true);
        setExpanded(true);
        setError(null);
        getSettings().then(settings => setCurrentTone(settings.tone));
      }
    };
    return () => { sidebarUpdateFn = null; };
  }, []);

  useEffect(() => {
    const listener = (message: any) => {
      if (message.action === 'showSuggestions') {
        const suggestions = message.suggestions || [];
        setSuggestion(suggestions[0] || null);
        setLastMessage(message.message || '');
        setLoading(false);
        setScanning(false);
        if (suggestions.length > 0) {
          if (!expanded) setHasNew(true);
          else setExpanded(true);
          if (suggestions[0]?.type) setCurrentTone(suggestions[0].type);
        }
      } else if (message.action === 'loading') {
        setLoading(true);
        setExpanded(true);
      }
    };
    browser.runtime.onMessage.addListener(listener);
    return () => { browser.runtime.onMessage.removeListener(listener); };
  }, [expanded]);

  useEffect(() => {
    const handleClickOutside = () => setShowToneDropdown(false);
    if (showToneDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showToneDropdown]);

  const handleToneChange = async (tone: ToneType) => {
    setCurrentTone(tone);
    setShowToneDropdown(false);
    const settings = await getSettings();
    const newSettings: Settings = { ...settings, tone };
    await saveSettings(newSettings);
    if (lastMessage && suggestion) {
      handleRegenerate();
    }
  };

  const handleCopy = async () => {
    if (suggestion) {
      await navigator.clipboard.writeText(suggestion.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleInsert = () => {
    if (suggestion) {
      insertTextToWhatsApp(suggestion.text);
      setExpanded(false);
    }
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError(null);
    try {
      const response = await browser.runtime.sendMessage({ action: 'regenerate' });
      const suggestions = response?.suggestions || [];
      setSuggestion(suggestions[0] || null);
      if (response?.error) setError(response.error);
    } catch (err: any) {
      setError(err.message || 'Failed');
    }
    setRegenerating(false);
  };

  const handleScanMessages = async () => {
    setScanning(true);
    setError(null);
    try {
      const { triggerSuggestions } = await import('./index');
      await triggerSuggestions();
    } catch {
      setError('Scan failed');
      setScanning(false);
    }
  };

  const validTone = TONE_CONFIG[currentTone] ? currentTone : 'professional';
  const toneConfig = TONE_CONFIG[validTone];
  const toneColor = toneColors[validTone];

  // Collapsed pill
  if (!expanded) {
    return (
      <div style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      }}>
        <button
          onClick={() => { setExpanded(true); setHasNew(false); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '12px 20px',
            background: 'linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%)',
            borderRadius: '25px',
            boxShadow: '0 4px 20px rgba(0, 122, 255, 0.4)',
            cursor: 'pointer',
            color: 'white',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            animation: hasNew ? 'pulse 1s infinite' : 'none',
          }}
        >
          <Sparkles size={18} />
          Reple
          {hasNew && (
            <span style={{
              background: '#FF3B30',
              color: 'white',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: '10px',
            }}>1</span>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
        cursor: isDragging ? 'grabbing' : 'default',
      }}
    >
      <div
        style={{
          width: '420px',
          background: theme.panelBg,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          borderRadius: '20px',
          boxShadow: theme.panelShadow,
          border: `1px solid ${theme.panelBorder}`,
          overflow: 'hidden',
          animation: 'fadeIn 0.25s ease-out',
        }}
      >
        {/* Header - Draggable */}
        <div
          onMouseDown={handleMouseDown}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '14px 18px',
            borderBottom: `1px solid ${theme.headerBorder}`,
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
        >
          {/* Drag handle */}
          <div style={{ color: theme.closeBtnColor, cursor: 'grab' }}>
            <GripVertical size={16} />
          </div>

          <img
            src={browser.runtime.getURL('/reple-logo.png')}
            alt=""
            style={{
              height: '28px',
              width: 'auto',
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))'
            }}
          />

          <span style={{ fontSize: '15px', fontWeight: 600, color: theme.titleColor, flex: 1 }}>
            Reple
          </span>

          {/* Tone Selector */}
          <div style={{ position: 'relative' }}>
            <div
              onClick={(e) => { e.stopPropagation(); setShowToneDropdown(!showToneDropdown); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '12px',
                cursor: 'pointer',
                background: toneColor.bg,
                border: `1px solid ${toneColor.border}`,
                color: toneColor.text,
              }}
            >
              {ToneIcons[currentTone]}
              <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {toneConfig.label}
              </span>
              <ChevronDown size={14} />
            </div>

            {showToneDropdown && (
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '6px',
                  background: theme.dropdownBg,
                  backdropFilter: 'blur(20px)',
                  borderRadius: '14px',
                  border: `1px solid ${theme.dropdownBorder}`,
                  boxShadow: '0 10px 40px rgba(0, 0, 0, 0.3)',
                  overflow: 'hidden',
                  minWidth: '180px',
                  zIndex: 100,
                }}
              >
                {toneList.map((tone, index) => {
                  const config = TONE_CONFIG[tone];
                  const color = toneColors[tone];
                  const isSelected = tone === currentTone;

                  return (
                    <div
                      key={tone}
                      onClick={() => handleToneChange(tone)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        padding: '12px 14px',
                        cursor: 'pointer',
                        background: isSelected ? color.bg : 'transparent',
                        borderBottom: index < toneList.length - 1 ? `1px solid ${theme.headerBorder}` : 'none',
                      }}
                    >
                      <span style={{ color: color.text }}>{ToneIcons[tone]}</span>
                      <span style={{
                        flex: 1,
                        fontSize: '13px',
                        fontWeight: isSelected ? 600 : 500,
                        color: isSelected ? color.text : theme.optionTextColor
                      }}>
                        {config.label}
                      </span>
                      {isSelected && <Check size={16} style={{ color: color.text }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Theme Toggle */}
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              border: 'none',
              background: theme.themeBtnBg,
              color: theme.themeBtnColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            title={isDark ? 'Switch to Light' : 'Switch to Dark'}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button
            onClick={() => setExpanded(false)}
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '8px',
              border: 'none',
              background: theme.closeBtnBg,
              color: theme.closeBtnColor,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '14px' }}>
          {/* Message preview */}
          {lastMessage && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              background: theme.messagePreviewBg,
              borderRadius: '12px',
              marginBottom: '14px',
              border: `1px solid ${theme.messagePreviewBorder}`,
            }}>
              <Quote size={14} style={{ color: theme.quoteColor }} />
              <span style={{
                flex: 1,
                fontSize: '12px',
                color: theme.messageTextColor,
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {lastMessage.length > 55 ? lastMessage.substring(0, 55) + '...' : lastMessage}
              </span>
              <ChevronDown size={14} style={{ color: theme.quoteColor }} />
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{
              padding: '50px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '14px',
            }}>
              <Loader2 size={28} style={{ color: '#007AFF', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px', color: theme.loadingTextColor, fontWeight: 500 }}>
                Generating {toneConfig.label} response...
              </span>
            </div>
          )}

          {/* Response */}
          {!loading && suggestion && (
            <div style={{
              background: theme.responseCardBg,
              borderRadius: '16px',
              border: `1px solid ${theme.responseCardBorder}`,
              overflow: 'hidden',
            }}>
              <div style={{ padding: '18px' }}>
                <p style={{
                  fontSize: '14px',
                  lineHeight: 1.65,
                  color: theme.responseTextColor,
                  fontWeight: 400,
                  margin: 0,
                }}>
                  {suggestion.text}
                </p>
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 14px',
                background: theme.actionsBarBg,
                borderTop: `1px solid ${theme.actionsBarBorder}`,
              }}>
                <button
                  onClick={handleScanMessages}
                  disabled={scanning || regenerating}
                  title="Rescan messages"
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    border: 'none',
                    background: theme.regenBtnBg,
                    color: theme.regenBtnColor,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: (scanning || regenerating) ? 0.6 : 1,
                  }}
                >
                  <RefreshCw size={18} style={{ animation: (scanning || regenerating) ? 'spin 1s linear infinite' : 'none' }} />
                </button>
                <div style={{ width: '1px', height: '20px', background: theme.dividerColor, margin: '0 4px' }}></div>
                <button
                  onClick={handleCopy}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 16px',
                    borderRadius: '10px',
                    border: `1px solid ${theme.copyBtnBorder}`,
                    background: copied ? '#34C759' : theme.copyBtnBg,
                    color: copied ? 'white' : theme.copyBtnColor,
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: copied ? '0 4px 12px rgba(52, 199, 89, 0.3)' : 'none',
                  }}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <button
                  onClick={handleInsert}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '10px 18px',
                    borderRadius: '10px',
                    border: 'none',
                    background: '#007AFF',
                    color: 'white',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
                  }}
                >
                  <CheckCircle size={14} />
                  Use This
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && !suggestion && !error && (
            <button
              onClick={handleScanMessages}
              disabled={scanning}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '12px',
                border: 'none',
                background: 'linear-gradient(135deg, #007AFF 0%, #5AC8FA 100%)',
                color: 'white',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(0, 122, 255, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                opacity: scanning ? 0.7 : 1,
              }}
            >
              {scanning ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <MessageSquare size={18} />}
              {scanning ? 'Scanning...' : 'Scan Messages'}
            </button>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: '16px', color: '#FF3B30', fontSize: '13px', textAlign: 'center' }}>
              ⚠️ {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function mountSidebar(container: HTMLElement) {
  const root = createRoot(container);
  root.render(<FloatingPopup />);

  return {
    root,
    update: (action: string, data: any) => {
      if (sidebarUpdateFn) sidebarUpdateFn(action, data);
    },
  };
}

export default FloatingPopup;
