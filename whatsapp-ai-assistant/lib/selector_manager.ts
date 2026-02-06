import { supabase } from '@/lib/supabase';

export interface SelectorConfig {
    input_field: string;
    message_container: string;
    incoming_message_class: string;
    outgoing_message_class: string;
    main_panel: string;
    [key: string]: string; // Allow extensibility
}

const DEFAULT_SELECTORS: Record<string, SelectorConfig> = {
    whatsapp: {
        input_field: 'footer div[contenteditable="true"]',
        message_container: 'div[role="row"]',
        incoming_message_class: '.message-in',
        outgoing_message_class: '.message-out',
        main_panel: '#main',
    },
    linkedin: {
        input_field: '.msg-form__contenteditable',
        message_container: '.msg-s-message-list__event',
        incoming_message_class: '', // Not used for now
        outgoing_message_class: '',
        main_panel: '.msg-s-message-list',
    },
    slack: {
        input_field: '[data-qa="message_input"]',
        message_container: '.c-virtual_list__item',
        incoming_message_class: '',
        outgoing_message_class: '',
        main_panel: '.c-virtual_list__scroll_container',
    },
    fiverr: {
        input_field: 'textarea.message-composer',
        message_container: '.msg-body',
        incoming_message_class: '',
        outgoing_message_class: '',
        main_panel: '.messages-wrapper',
    }
};

export class SelectorManager {
    private static instance: SelectorManager;
    private selectors: Record<string, SelectorConfig> = { ...DEFAULT_SELECTORS };
    private initialized = false;

    private constructor() { }

    static getInstance(): SelectorManager {
        if (!SelectorManager.instance) {
            SelectorManager.instance = new SelectorManager();
        }
        return SelectorManager.instance;
    }

    async init() {
        if (this.initialized) return;

        try {
            // 1. Load from local storage first (faster)
            const stored = await browser.storage.local.get('remoteSelectors');
            if (stored.remoteSelectors) {
                this.selectors = { ...this.selectors, ...stored.remoteSelectors };
            }

            // 2. Refresh from Supabase (Remote Config)
            await this.fetchRemoteSelectors();

            this.initialized = true;
            console.log('[SelectorManager] Initialized with selectors:', this.selectors);
        } catch (error) {
            console.error('[SelectorManager] Init failed, using defaults:', error);
        }
    }

    async fetchRemoteSelectors() {
        try {
            const { data, error } = await supabase
                .from('platform_selectors')
                .select('*')
                .eq('is_active', true);

            if (error) throw error;

            if (data && data.length > 0) {
                const remoteConfig: Record<string, any> = {};

                data.forEach((row) => {
                    if (!remoteConfig[row.platform]) remoteConfig[row.platform] = {};
                    remoteConfig[row.platform][row.selector_key] = row.selector_value;
                });

                // Merge with existing
                this.selectors = {
                    whatsapp: { ...this.selectors.whatsapp, ...remoteConfig.whatsapp },
                    linkedin: { ...this.selectors.linkedin, ...remoteConfig.linkedin },
                    slack: { ...this.selectors.slack, ...remoteConfig.slack },
                };

                // Cache for next time
                await browser.storage.local.set({ remoteSelectors: this.selectors });
                console.log('[SelectorManager] Remote selectors updated');
            }
        } catch (err) {
            console.warn('[SelectorManager] Failed to fetch remote selectors:', err);
        }
    }

    getSelector(platform: string, key: string): string {
        const platformConfig = this.selectors[platform];
        if (!platformConfig) return '';

        // Return remote/stored value or fallback to hardcoded default
        return platformConfig[key] || DEFAULT_SELECTORS[platform]?.[key] || '';
    }

    getSelectors(platform: string): SelectorConfig {
        return this.selectors[platform] || DEFAULT_SELECTORS[platform] || {} as SelectorConfig;
    }

    // Allow manual override (Calibration Mode)
    async saveUserOverride(platform: string, key: string, value: string) {
        this.selectors[platform][key] = value;

        // Persist to local storage
        await browser.storage.local.set({ remoteSelectors: this.selectors });
        console.log(`[SelectorManager] User override saved: ${platform}.${key} = ${value}`);
    }
}
