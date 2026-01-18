import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Reple - AI Reply Assistant',
    description: 'Smart AI-powered response suggestions for WhatsApp Web',
    version: '1.0.0',
    permissions: ['storage', 'activeTab'],
    host_permissions: ['https://web.whatsapp.com/*', 'https://api.openai.com/*'],
    icons: {
      16: 'icon.png',
      32: 'icon.png',
      48: 'icon.png',
      128: 'icon.png',
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'Reple',
      default_icon: {
        16: 'icon.png',
        32: 'icon.png',
        48: 'icon.png',
      },
    },
    web_accessible_resources: [
      {
        resources: ['icon.png', 'reple-logo.png', 'reple-icon.png'],
        matches: ['https://web.whatsapp.com/*'],
      },
    ],
  },
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    base: './',
  }),
});
