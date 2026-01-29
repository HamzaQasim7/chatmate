export class WhatsAppAudioInjector {
    private observer: MutationObserver | null = null;
    private processedMessages = new Set<string>();
    private onAnalysisComplete: ((result: any) => void) | null = null;

    init(onAnalysisComplete?: (result: any) => void) {
        console.log('[Rainmaker Audio] Init called');
        if (onAnalysisComplete) this.onAnalysisComplete = onAnalysisComplete;
        this.observe();
    }

    observe() {
        const chatContainerSelectors = [
            '[data-testid="conversation-panel-body"]',
            '[data-testid="conversation-panel-messages"]',
            '#main [role="application"]',
            '.copyable-area > div:last-child',
        ];

        let chatContainer: Element | null = null;
        for (const selector of chatContainerSelectors) {
            chatContainer = document.querySelector(selector);
            if (chatContainer) {
                console.log(`[Rainmaker Audio] Chat container found via: ${selector}`);
                break;
            }
        }

        if (!chatContainer) {
            console.log('[Rainmaker Audio] Chat container not found, retrying...');
            setTimeout(() => this.observe(), 2000);
            return;
        }

        // Disconnect previous observer if any
        if (this.observer) this.observer.disconnect();

        this.observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node instanceof HTMLElement) {
                        this.scanForAudio(node);
                    }
                });
            });
        });

        this.observer.observe(chatContainer, { childList: true, subtree: true });

        // Initial scan
        this.scanForAudio(document.body);

        // Watch for chat switches (container replacement)
        this.watchForChatSwitch();
    }

    watchForChatSwitch() {
        const mainPanel = document.querySelector('#main') || document.querySelector('[data-testid="conversation-panel-wrapper"]');
        if (mainPanel) {
            const switchObserver = new MutationObserver(() => {
                // Re-run observe to re-attach if container changed
                const chatContainer = document.querySelector('[data-testid="conversation-panel-body"]'); // Quick check
                if (!chatContainer) {
                    // Only re-observe if we suspect a change/loss
                    // Actually, safer to just re-scan or let the main loop handle it.
                    // But let's just trigger a re-scan of body for now to catch new content
                    this.scanForAudio(document.body);
                }
            });
            switchObserver.observe(mainPanel, { childList: true, subtree: true });
        }
    }

    scanForAudio(root: HTMLElement) {
        // STRICT SCOPE CHECK: Only analyze messages in the active conversation panel (#main).
        // If the root is not inside #main (and is not #main itself), we must ignore it
        // to prevent buttons appearing in the sidebar chat list.

        let targetRoot = root;
        const mainPanel = document.getElementById('main');

        if (!mainPanel) { return; } // No chat open

        // Check if root is inside main or IS main
        if (!mainPanel.contains(root) && mainPanel !== root) {
            // Does root contain main? (e.g. scanning document.body)
            if (root.contains(mainPanel)) {
                targetRoot = mainPanel;
            } else {
                return; // Outside main (sidebar) -> SKIP
            }
        }

        const messageRows = targetRoot.querySelectorAll('div[role="row"]');
        let foundCount = 0;

        messageRows.forEach(row => {
            // Skip if already processed
            if (row.querySelector('.rainmaker-analyze-btn')) return;

            // Check for audio indicators inside this row
            const rowHtml = row.innerHTML;
            const innerText = (row as HTMLElement).innerText || '';

            // Audio messages typically have:
            // 1. Duration pattern like "0:01", "0:27", "1:30"  
            // 2. Speed control "1×" or "1.5×" or "2×"
            // 3. Waveform/audio visualization elements
            const hasDuration = /\d+:\d{2}/.test(innerText);
            const hasSpeedControl = /[12]\.?[05]?×/.test(innerText) || innerText.includes('1×') || innerText.includes('2×');
            const hasAudioButton = rowHtml.includes('data-icon="audio') || rowHtml.includes('ptt-');
            const hasWaveform = rowHtml.includes('waveform') || rowHtml.includes('audio-progress');

            // If ANY audio indicator is found, this is likely an audio message
            if (hasDuration || hasSpeedControl || hasAudioButton || hasWaveform) {
                foundCount++;
                console.log(`[Rainmaker Audio] Audio row detected! Duration: ${hasDuration}, Speed: ${hasSpeedControl}, Button: ${hasAudioButton}`);
                this.injectButton(row as HTMLElement);
            }
        });

        console.log(`[Rainmaker Audio] Scanned ${messageRows.length} rows. Found ${foundCount} audio messages.`);
    }

    injectButton(row: HTMLElement) {
        // Avoid duplicate injection - use DOM position as unique ID if no data-id
        let rowId = row.getAttribute('data-id');
        if (!rowId) {
            // Generate a unique ID based on row content hash
            const rowText = row.innerText?.slice(0, 50) || '';
            const rowIndex = Array.from(row.parentElement?.children || []).indexOf(row);
            rowId = `audio-row-${rowIndex}-${rowText.length}`;
        }

        if (this.processedMessages.has(rowId)) {
            console.log('[Rainmaker Audio] Skip (already processed):', rowId);
            return;
        }
        if (row.querySelector('.rainmaker-analyze-btn')) {
            console.log('[Rainmaker Audio] Skip (button exists):', rowId);
            return;
        }

        // NOTE: Removed message-out filtering - we want buttons on ALL audio messages
        // Users may want to analyze their own sent audio too

        // Find the message bubble inside the row
        const bubble = row.querySelector('[data-testid="msg-container"]')
            || row.querySelector('.message-in')
            || row.querySelector('.message-out') // Include outgoing too
            || row.querySelector('.copyable-text')?.closest('div[class*="message"]')
            || row;

        console.log('[Rainmaker Audio] Injecting button for row', rowId, 'bubble:', bubble?.className);

        const btn = document.createElement('button');
        // Circular icon button (no emoji, using SVG)
        btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
        </svg>`;
        btn.className = 'rainmaker-analyze-btn';
        btn.title = 'Analyze Audio with AI';
        // INLINE positioning (inside the bubble) - prevents clipping from overflow:hidden
        btn.style.cssText = `
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            margin-left: 8px !important;
            vertical-align: middle !important;
            background: linear-gradient(135deg, #10B981 0%, #059669 100%) !important;
            color: white !important;
            border: none !important;
            width: 28px !important;
            height: 28px !important;
            min-width: 28px !important;
            padding: 0 !important;
            border-radius: 50% !important;
            font-size: 12px !important;
            cursor: pointer !important;
            box-shadow: 0 2px 6px rgba(16, 185, 129, 0.4) !important;
            transition: transform 0.2s, box-shadow 0.2s !important;
            flex-shrink: 0 !important;
        `;
        btn.onmouseenter = () => {
            btn.style.transform = 'scale(1.1)';
            btn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.6)';
        };
        btn.onmouseleave = () => {
            btn.style.transform = 'scale(1)';
            btn.style.boxShadow = '0 2px 6px rgba(16, 185, 129, 0.4)';
        };
        btn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();

            // Visual feedback
            btn.innerHTML = '🎤 Extracting...';
            btn.disabled = true;

            try {
                // Extract audio as Base64 (needed for server-side API)
                const audioBase64 = await this.extractAudioBase64(row);

                if (!audioBase64) {
                    throw new Error('Transcription failed: Could not automatically extraction audio. Please try again.');
                }

                btn.innerHTML = '🧠 Analyzing...';

                // Send to background script -> Supabase Edge Function (server-side API key)
                const response = await browser.runtime.sendMessage({
                    action: 'analyzeAudio',
                    data: { audioBase64 }
                });

                if (response.success && response.result) {
                    btn.innerHTML = '✅ Done';
                    // Notify Sidebar
                    if (this.onAnalysisComplete) {
                        this.onAnalysisComplete(response.result);
                    }
                } else {
                    throw new Error(response.error || 'Analysis failed');
                }

            } catch (err: any) {
                console.error('[Rainmaker Audio] Error:', err);
                btn.innerHTML = '❌ Error';
                // Show error message if available
                if (err.message && err.message !== 'Analysis failed') {
                    alert(`Audio Analysis Error: ${err.message}`);
                }
                setTimeout(() => {
                    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                        <path d="M2 17l10 5 10-5"/>
                        <path d="M2 12l10 5 10-5"/>
                    </svg>`;
                    btn.disabled = false;
                }, 2000);
            }
        };

        // Append to bubble (has relative positioning set above)
        bubble.appendChild(btn);

        this.processedMessages.add(rowId);
    }

    async extractAudioBlob(row: HTMLElement): Promise<Blob | null> {
        // WhatsApp lazy-loads audio. If invalid, we must trigger play programmatically.
        const audio = row.querySelector('audio');

        // If audio exists and has src (user already played it), return it
        if (audio && audio.src && audio.src.startsWith('blob:')) {
            console.log('[Rainmaker Audio] Audio already loaded:', audio.src);
            return await this.fetchBlob(audio.src);
        }

        console.log('[Rainmaker Audio] Audio not loaded. Auto-playing to fetch blob...');

        // Find the play button
        // It's usually a span with role="button" or a button element with specific icon
        const playBtn = row.querySelector('[data-icon="audio-play"]')
            || row.querySelector('[data-icon="audio-play-filled"]')
            || row.querySelector('span[data-icon="play"]')
            || row.querySelector('button[title="Play"]')
            || row.querySelector('[aria-label="Play voice message"]')
            || row.querySelector('[data-testid="audio-play"]');

        if (playBtn) {
            console.log('[Rainmaker Audio] Found Play Button:', {
                tagName: playBtn.tagName,
                className: playBtn.className,
                ariaLabel: playBtn.getAttribute('aria-label')
            });

            // Programmatically click play
            const clickablePlay = playBtn.closest('[role="button"]') as HTMLElement || playBtn as HTMLElement;

            console.log('[Rainmaker Audio] clicking element:', clickablePlay.tagName, clickablePlay.className);
            this.simulateClick(clickablePlay);

            // Wait for audio src to appear
            const blobUrl = await this.waitForAudioSrc(row, clickablePlay);
            if (blobUrl) return await this.fetchBlob(blobUrl);
        } else {
            console.log('[Rainmaker Audio] No play button found via selectors');
        }

        // FALLBACK: Interaction with audio tag directly
        if (audio) {
            console.log('[Rainmaker Audio] Button detection failed. Trying direct audio.play()...');
            try {
                audio.muted = true;
                const playPromise = audio.play();
                if (playPromise !== undefined) playPromise.catch(() => { });

                const blobUrl = await this.waitForAudioSrc(row);
                if (blobUrl) return await this.fetchBlob(blobUrl);
            } catch (e) {
                console.error('[Rainmaker Audio] Direct play fallback failed', e);
            }
        }

        console.error('[Rainmaker Audio] Auto-fetch failed: No audio src generated.');
        return null;


    }

    async waitForAudioSrc(row: HTMLElement, triggerBtn?: HTMLElement, timeoutMs = 12000): Promise<string | null> {
        return new Promise((resolve) => {
            const startTime = Date.now();
            let retries = 0;
            let clickedRetry = false;

            const check = () => {
                const elapsed = Date.now() - startTime;
                const audio = row.querySelector('audio');

                // MUTE IMMEDIATELY IF FOUND (Silent Fetch)
                if (audio) {
                    audio.muted = true;
                    // Debug log periodically
                    if (retries % 50 === 0) {
                        console.log('[Rainmaker Audio] Polling audio...', {
                            src: audio.src,
                            readyState: audio.readyState
                        });
                    }
                }

                // Check for blob URL - looser check
                if (audio && audio.src && audio.src.length > 10) {
                    console.log('[Rainmaker Audio] Audio src found:', audio.src);
                    resolve(audio.src);
                    return;
                }

                // RETRY LOGIC: If no audio after 2 seconds, click again
                if (triggerBtn && !audio && elapsed > 2000 && !clickedRetry) {
                    console.log('[Rainmaker Audio] Retry: clicking play button again...');
                    this.simulateClick(triggerBtn);
                    clickedRetry = true;
                }

                if (elapsed > timeoutMs) {
                    console.log('[Rainmaker Audio] Timed out waiting for audio src');
                    resolve(null);
                    return;
                }

                retries++;
                requestAnimationFrame(check);
            };

            check();
        });
    }

    simulateClick(element: HTMLElement) {
        if (!element) return;
        ['mousedown', 'mouseup', 'click'].forEach(eventType => {
            const event = new MouseEvent(eventType, {
                bubbles: true,
                cancelable: true,
                view: window
            });
            element.dispatchEvent(event);
        });
    }

    async fetchBlob(url: string): Promise<Blob | null> {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            console.log('[Rainmaker Audio] Success! Blob size:', blob.size);
            return blob;
        } catch (e) {
            console.error('[Rainmaker Audio] Blob fetch failed', e);
            return null;
        }
    }

    async extractAudioData(_row: HTMLElement): Promise<string | null> {
        // Alias for extractAudioBase64
        return this.extractAudioBase64(_row);
    }

    async extractAudioBase64(row: HTMLElement): Promise<string | null> {
        const blob = await this.extractAudioBlob(row);
        if (!blob) return null;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error('Failed to convert blob to string'));
                }
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    disconnect() {
        if (this.observer) this.observer.disconnect();
    }
}
