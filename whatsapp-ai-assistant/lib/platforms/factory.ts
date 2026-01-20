import type { PlatformAdapter } from './adapter';
import { WhatsAppAdapter } from './whatsapp';
import { SlackAdapter } from './slack';

export class PlatformFactory {
    private static instance: PlatformAdapter | null = null;

    static getAdapter(): PlatformAdapter | null {
        if (this.instance) return this.instance;

        const url = window.location.href;

        if (url.includes('web.whatsapp.com')) {
            this.instance = new WhatsAppAdapter();
            return this.instance;
        }

        if (url.includes('app.slack.com')) {
            this.instance = new SlackAdapter();
            return this.instance;
        }

        return null;
    }
}
