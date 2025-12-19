import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'WhatsApp AI Assistant',
    description: 'AI-powered response suggestions for WhatsApp Web',
    version: '1.0.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://web.whatsapp.com/*'],
  },
  modules: ['@wxt-dev/module-react'],
});
