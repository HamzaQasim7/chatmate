// ============================================================================
// 1. TYPES & INTERFACES
// ============================================================================

// types/audio.ts
export interface AudioMessage {
  id: string;
  platform: 'whatsapp' | 'linkedin' | 'slack';
  audioUrl: string;
  blob?: Blob;
  duration?: number;
  timestamp: number;
  sender: string;
  conversationId: string;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  confidence?: number;
}

export interface BuyingSignal {
  type: 'positive' | 'negative' | 'neutral' | 'objection';
  confidence: number;
  signal: string;
  category: 'price' | 'timing' | 'authority' | 'need' | 'competition' | 'general';
  quote: string;
}

export interface AudioAnalysis {
  transcription: TranscriptionResult;
  sentiment: {
    overall: 'positive' | 'negative' | 'neutral';
    score: number;
  };
  buyingSignals: BuyingSignal[];
  urgency: 'high' | 'medium' | 'low';
  suggestedTone: string;
  keyPoints: string[];
  recommendedResponse: string;
}

// ============================================================================
// 2. AUDIO DETECTION & EXTRACTION
// ============================================================================

// content/audioDetector.ts
export class AudioDetector {
  private platform: 'whatsapp' | 'linkedin' | 'slack';
  private observer: MutationObserver | null = null;

  constructor(platform: 'whatsapp' | 'linkedin' | 'slack') {
    this.platform = platform;
  }

  // Start monitoring for audio messages
  startMonitoring(callback: (audio: AudioMessage) => void) {
    const config = this.getPlatformConfig();
    
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const audioMessages = this.extractAudioFromNode(node as Element);
            audioMessages.forEach(callback);
          }
        });
      });
    });

    const targetNode = document.querySelector(config.containerSelector);
    if (targetNode) {
      this.observer.observe(targetNode, {
        childList: true,
        subtree: true
      });
    }
  }

  stopMonitoring() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private getPlatformConfig() {
    switch (this.platform) {
      case 'whatsapp':
        return {
          containerSelector: '#main',
          audioSelector: 'span[data-icon="audio-play"], span[data-icon="audio-pause"]',
          audioElementSelector: 'audio',
          durationSelector: '.message-in span[dir="auto"]',
          senderSelector: 'span[dir="auto"][class*="copyable-text"]',
        };
      case 'linkedin':
        return {
          containerSelector: '.msg-s-message-list',
          audioSelector: 'audio, [data-test-icon="audio-icon"]',
          audioElementSelector: 'audio',
          durationSelector: '.msg-s-message-group__timestamp',
          senderSelector: '.msg-s-message-group__name',
        };
      case 'slack':
        return {
          containerSelector: '.c-virtual_list__scroll_container',
          audioSelector: 'audio, [data-qa="audio_player"]',
          audioElementSelector: 'audio',
          durationSelector: '.c-message_attachment__duration',
          senderSelector: '.c-message__sender',
        };
    }
  }

  private extractAudioFromNode(node: Element): AudioMessage[] {
    const config = this.getPlatformConfig();
    const audioMessages: AudioMessage[] = [];
    
    const audioElements = node.querySelectorAll(config.audioElementSelector);
    
    audioElements.forEach((audioEl) => {
      const audio = audioEl as HTMLAudioElement;
      if (!audio.src) return;

      const messageContainer = audio.closest('[data-id], .msg-s-event-listitem, .c-message_kit__message');
      if (!messageContainer) return;

      const audioMessage: AudioMessage = {
        id: this.generateId(messageContainer),
        platform: this.platform,
        audioUrl: audio.src,
        duration: audio.duration || 0,
        timestamp: Date.now(),
        sender: this.extractSender(messageContainer, config),
        conversationId: this.extractConversationId(),
      };

      audioMessages.push(audioMessage);
    });

    return audioMessages;
  }

  private generateId(container: Element): string {
    return `audio_${this.platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractSender(container: Element, config: any): string {
    const senderEl = container.querySelector(config.senderSelector);
    return senderEl?.textContent?.trim() || 'Unknown';
  }

  private extractConversationId(): string {
    // Platform-specific conversation ID extraction
    switch (this.platform) {
      case 'whatsapp':
        return window.location.pathname.split('/').pop() || 'unknown';
      case 'linkedin':
        return document.querySelector('.msg-thread')?.getAttribute('data-conversation-id') || 'unknown';
      case 'slack':
        return document.querySelector('[data-qa="message_container"]')?.getAttribute('data-channel-id') || 'unknown';
      default:
        return 'unknown';
    }
  }

  // Download audio blob for processing
  async downloadAudioBlob(audioUrl: string): Promise<Blob> {
    try {
      const response = await fetch(audioUrl);
      if (!response.ok) throw new Error('Failed to fetch audio');
      return await response.blob();
    } catch (error) {
      console.error('Error downloading audio:', error);
      throw error;
    }
  }
}

// ============================================================================
// 3. AUDIO TRANSCRIPTION SERVICE
// ============================================================================

// services/audioTranscription.ts
export class AudioTranscriptionService {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async transcribe(audioBlob: Blob): Promise<TranscriptionResult> {
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-1');
      formData.append('language', 'en'); // Auto-detect or specify
      formData.append('response_format', 'verbose_json');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Transcription failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        text: data.text,
        language: data.language || 'en',
        duration: data.duration || 0,
        confidence: data.confidence,
      };
    } catch (error) {
      console.error('Transcription error:', error);
      throw error;
    }
  }
}

// ============================================================================
// 4. BUYING SIGNAL ANALYZER
// ============================================================================

// services/buyingSignalAnalyzer.ts
export class BuyingSignalAnalyzer {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async analyze(transcription: string, conversationContext?: string): Promise<AudioAnalysis> {
    try {
      const systemPrompt = this.getAnalysisPrompt();
      const userMessage = this.buildUserMessage(transcription, conversationContext);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        throw new Error(`Analysis failed: ${response.statusText}`);
      }

      const data = await response.json();
      const analysis = JSON.parse(data.choices[0].message.content);

      return this.parseAnalysis(analysis, transcription);
    } catch (error) {
      console.error('Analysis error:', error);
      throw error;
    }
  }

  private getAnalysisPrompt(): string {
    return `You are an expert sales analyst specializing in identifying buying signals from audio transcriptions.

Analyze the transcribed audio message for:
1. **Buying Signals**: Identify positive, negative, neutral signals and objections
2. **Signal Categories**: price, timing, authority, need, competition, general
3. **Sentiment**: overall emotional tone and confidence score (-1 to 1)
4. **Urgency Level**: high, medium, or low
5. **Key Points**: extract 3-5 most important points
6. **Suggested Tone**: which Reple tone would work best (Professional, Rainmaker, Negotiator, Quick, Natural, Friendly, Formal)
7. **Recommended Response**: draft a strategic reply addressing the key signals

Return a JSON object with this structure:
{
  "sentiment": {"overall": "positive|negative|neutral", "score": -1 to 1},
  "buyingSignals": [{"type": "positive|negative|neutral|objection", "confidence": 0-1, "signal": "description", "category": "price|timing|authority|need|competition|general", "quote": "exact quote"}],
  "urgency": "high|medium|low",
  "suggestedTone": "tone name",
  "keyPoints": ["point1", "point2", ...],
  "recommendedResponse": "strategic reply text"
}`;
  }

  private buildUserMessage(transcription: string, context?: string): string {
    let message = `Analyze this audio transcription for buying signals:\n\n"${transcription}"`;
    
    if (context) {
      message += `\n\nConversation context:\n${context}`;
    }

    return message;
  }

  private parseAnalysis(rawAnalysis: any, transcription: string): AudioAnalysis {
    return {
      transcription: {
        text: transcription,
        language: 'en',
        duration: 0,
      },
      sentiment: rawAnalysis.sentiment,
      buyingSignals: rawAnalysis.buyingSignals,
      urgency: rawAnalysis.urgency,
      suggestedTone: rawAnalysis.suggestedTone,
      keyPoints: rawAnalysis.keyPoints,
      recommendedResponse: rawAnalysis.recommendedResponse,
    };
  }
}

// ============================================================================
// 5. AUDIO ANALYSIS UI COMPONENT
// ============================================================================

// components/AudioAnalysisPanel.tsx
import React, { useState } from 'react';

interface AudioAnalysisPanelProps {
  analysis: AudioAnalysis;
  onUseResponse: (response: string) => void;
  onRegenerate: () => void;
  isLoading?: boolean;
}

export const AudioAnalysisPanel: React.FC<AudioAnalysisPanelProps> = ({
  analysis,
  onUseResponse,
  onRegenerate,
  isLoading = false
}) => {
  const [expanded, setExpanded] = useState(true);

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return '#10b981';
      case 'negative': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'high': return '#ef4444';
      case 'medium': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getSignalIcon = (type: string) => {
    switch (type) {
      case 'positive': return '✅';
      case 'negative': return '❌';
      case 'objection': return '🚩';
      default: return '➖';
    }
  };

  return (
    <div style={{
      background: '#ffffff',
      border: '1px solid #e5e7eb',
      borderRadius: '12px',
      padding: '16px',
      marginTop: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>🎙️</span>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
            Audio Analysis
          </h3>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px'
          }}
        >
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {expanded && (
        <>
          {/* Sentiment & Urgency */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                Sentiment
              </div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px',
                background: '#f9fafb',
                borderRadius: '6px'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: getSentimentColor(analysis.sentiment.overall)
                }} />
                <span style={{ fontSize: '14px', fontWeight: '500', textTransform: 'capitalize' }}>
                  {analysis.sentiment.overall}
                </span>
                <span style={{ fontSize: '12px', color: '#6b7280' }}>
                  ({Math.round(analysis.sentiment.score * 100)}%)
                </span>
              </div>
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '4px' }}>
                Urgency
              </div>
              <div style={{
                padding: '8px',
                background: '#f9fafb',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <div style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: getUrgencyColor(analysis.urgency)
                }} />
                <span style={{ fontSize: '14px', fontWeight: '500', textTransform: 'capitalize' }}>
                  {analysis.urgency}
                </span>
              </div>
            </div>
          </div>

          {/* Buying Signals */}
          {analysis.buyingSignals.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: '600' }}>
                Buying Signals
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {analysis.buyingSignals.map((signal, idx) => (
                  <div
                    key={idx}
                    style={{
                      padding: '10px',
                      background: '#f9fafb',
                      borderRadius: '6px',
                      borderLeft: `3px solid ${getSentimentColor(signal.type === 'objection' ? 'negative' : signal.type)}`
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span>{getSignalIcon(signal.type)}</span>
                      <span style={{ fontSize: '13px', fontWeight: '600' }}>
                        {signal.signal}
                      </span>
                      <span style={{
                        fontSize: '11px',
                        color: '#6b7280',
                        background: '#ffffff',
                        padding: '2px 6px',
                        borderRadius: '4px'
                      }}>
                        {signal.category}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#4b5563', fontStyle: 'italic' }}>
                      "{signal.quote}"
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Points */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: '600' }}>
              Key Points
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', color: '#4b5563' }}>
              {analysis.keyPoints.map((point, idx) => (
                <li key={idx} style={{ marginBottom: '4px' }}>{point}</li>
              ))}
            </ul>
          </div>

          {/* Transcription */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px', fontWeight: '600' }}>
              Transcription
            </div>
            <div style={{
              padding: '10px',
              background: '#f9fafb',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#374151',
              lineHeight: '1.5'
            }}>
              {analysis.transcription.text}
            </div>
          </div>

          {/* Recommended Response */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px'
            }}>
              <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600' }}>
                Recommended Response ({analysis.suggestedTone})
              </div>
              <button
                onClick={onRegenerate}
                disabled={isLoading}
                style={{
                  background: 'transparent',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  color: '#6b7280'
                }}
              >
                🔄 Regenerate
              </button>
            </div>
            <div style={{
              padding: '12px',
              background: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#166534',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap'
            }}>
              {analysis.recommendedResponse}
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => onUseResponse(analysis.recommendedResponse)}
            disabled={isLoading}
            style={{
              width: '100%',
              padding: '12px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              opacity: isLoading ? 0.6 : 1
            }}
          >
            {isLoading ? 'Processing...' : '✨ Use This Response'}
          </button>
        </>
      )}
    </div>
  );
};

// ============================================================================
// 6. MAIN AUDIO MANAGER
// ============================================================================

// services/audioManager.ts
export class AudioManager {
  private detector: AudioDetector;
  private transcriptionService: AudioTranscriptionService;
  private analyzer: BuyingSignalAnalyzer;
  private onAnalysisComplete: (analysis: AudioAnalysis, audioId: string) => void;
  private processingQueue: Map<string, boolean> = new Map();

  constructor(
    platform: 'whatsapp' | 'linkedin' | 'slack',
    apiKey: string,
    onAnalysisComplete: (analysis: AudioAnalysis, audioId: string) => void
  ) {
    this.detector = new AudioDetector(platform);
    this.transcriptionService = new AudioTranscriptionService(apiKey);
    this.analyzer = new BuyingSignalAnalyzer(apiKey);
    this.onAnalysisComplete = onAnalysisComplete;
  }

  start() {
    this.detector.startMonitoring(async (audioMessage) => {
      await this.processAudio(audioMessage);
    });
  }

  stop() {
    this.detector.stopMonitoring();
  }

  async processAudio(audioMessage: AudioMessage) {
    // Prevent duplicate processing
    if (this.processingQueue.has(audioMessage.id)) {
      return;
    }

    this.processingQueue.set(audioMessage.id, true);

    try {
      // 1. Download audio
      const audioBlob = await this.detector.downloadAudioBlob(audioMessage.audioUrl);

      // 2. Transcribe
      const transcription = await this.transcriptionService.transcribe(audioBlob);

      // 3. Get conversation context (optional)
      const context = await this.getConversationContext(audioMessage.platform);

      // 4. Analyze for buying signals
      const analysis = await this.analyzer.analyze(transcription.text, context);

      // 5. Notify completion
      this.onAnalysisComplete(analysis, audioMessage.id);
    } catch (error) {
      console.error('Audio processing error:', error);
      // You might want to show an error notification here
    } finally {
      this.processingQueue.delete(audioMessage.id);
    }
  }

  private async getConversationContext(platform: string): Promise<string> {
    // Extract last few messages from the conversation for context
    // This is platform-specific
    const messages: string[] = [];
    
    try {
      let messageElements: NodeListOf<Element>;
      
      switch (platform) {
        case 'whatsapp':
          messageElements = document.querySelectorAll('.message-in .copyable-text, .message-out .copyable-text');
          break;
        case 'linkedin':
          messageElements = document.querySelectorAll('.msg-s-event-listitem__body');
          break;
        case 'slack':
          messageElements = document.querySelectorAll('.c-message_kit__text');
          break;
        default:
          return '';
      }

      // Get last 5 messages
      const recentMessages = Array.from(messageElements).slice(-5);
      recentMessages.forEach((el) => {
        const text = el.textContent?.trim();
        if (text) messages.push(text);
      });
    } catch (error) {
      console.error('Error extracting context:', error);
    }

    return messages.join('\n');
  }
}

// ============================================================================
// 7. INTEGRATION WITH EXISTING REPLE CODE
// ============================================================================

// entrypoints/content.tsx (Add to your existing content script)
import { AudioManager } from '../services/audioManager';
import { AudioAnalysisPanel } from '../components/AudioAnalysisPanel';

// In your existing content script initialization:
let audioManager: AudioManager | null = null;
const audioAnalyses = new Map<string, AudioAnalysis>();

function initializeAudioFeature(platform: 'whatsapp' | 'linkedin' | 'slack', apiKey: string) {
  audioManager = new AudioManager(
    platform,
    apiKey,
    (analysis, audioId) => {
      // Store analysis
      audioAnalyses.set(audioId, analysis);
      
      // Show analysis in UI
      showAudioAnalysis(analysis);
    }
  );

  audioManager.start();
}

function showAudioAnalysis(analysis: AudioAnalysis) {
  // Find or create container for audio analysis
  let container = document.getElementById('reple-audio-analysis');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'reple-audio-analysis';
    container.style.position = 'fixed';
    container.style.right = '20px';
    container.style.top = '100px';
    container.style.zIndex = '10000';
    container.style.maxWidth = '400px';
    document.body.appendChild(container);
  }

  // Render React component
  const root = createRoot(container);
  root.render(
    <AudioAnalysisPanel
      analysis={analysis}
      onUseResponse={(response) => {
        // Insert into message input
        insertIntoMessageInput(response);
      }}
      onRegenerate={async () => {
        // Regenerate analysis with different tone or approach
        // You can implement this based on your needs
      }}
    />
  );
}

function insertIntoMessageInput(text: string) {
  // Platform-specific message insertion
  const platform = detectPlatform();
  
  let inputElement: HTMLElement | null = null;
  
  switch (platform) {
    case 'whatsapp':
      inputElement = document.querySelector('[contenteditable="true"][data-tab="10"]');
      break;
    case 'linkedin':
      inputElement = document.querySelector('.msg-form__contenteditable');
      break;
    case 'slack':
      inputElement = document.querySelector('[data-qa="message_input"]');
      break;
  }

  if (inputElement) {
    // Set text content
    if (inputElement instanceof HTMLDivElement) {
      inputElement.textContent = text;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Focus the input
    inputElement.focus();
  }
}

// ============================================================================
// 8. BACKGROUND SCRIPT HANDLER
// ============================================================================

// entrypoints/background.ts (Add to existing background script)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PROCESS_AUDIO') {
    // Handle audio processing request
    processAudioInBackground(request.audioData)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
  }
});

async function processAudioInBackground(audioData: any) {
  // Additional processing if needed
  return audioData;
}

// ============================================================================
// 9. SETTINGS INTEGRATION
// ============================================================================

// Add to your settings/options page:
interface AudioSettings {
  enableAudioAnalysis: boolean;
  autoAnalyze: boolean;
  showTranscription: boolean;
  defaultToneForAudio: string;
}

export const defaultAudioSettings: AudioSettings = {
  enableAudioAnalysis: true,
  autoAnalyze: true,
  showTranscription: true,
  defaultToneForAudio: 'Rainmaker',
};

// ============================================================================
// 10. USAGE INSTRUCTIONS
// ============================================================================

/*
INTEGRATION STEPS:

1. Install this code into your existing Reple extension structure
2. Update your manifest.json to include audio permissions:
   "permissions": ["storage", "activeTab", "tabs", "<all_urls>"]

3. In your main content script, initialize audio feature:
   ```typescript
   const platform = detectPlatform(); // Your existing function
   const apiKey = await getStoredApiKey(); // Your existing function
   
   if (settings.audioSettings.enableAudioAnalysis) {
     initializeAudioFeature(platform, apiKey);
   }
   ```

4. Add audio settings to your options page UI

5. Test on each platform:
   - WhatsApp Web: Send audio message, verify detection and analysis
   - LinkedIn: Send voice message, verify detection and analysis
   - Slack: Send audio clip, verify detection and analysis

NOTES:
- This handles audio in real-time as messages arrive
- Analysis happens automatically when audio is detected
- Results appear in floating panel with actionable insights
- User can click to insert recommended response
- All processing uses user's OpenAI API key (BYO-Key model)
- No data stored on your servers (privacy-first)

COST ESTIMATION (per audio message):
- Whisper API: ~$0.006 per minute of audio
- GPT-4o-mini analysis: ~$0.002 per analysis
- Total: ~$0.01 per 1-minute audio message
*/