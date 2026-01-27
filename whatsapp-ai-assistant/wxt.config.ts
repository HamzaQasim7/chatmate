import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Reple - AI Reply Assistant',
    description: 'Boost productivity with smart AI replies. Generate personalized responses instantly on WhatsApp, LinkedIn, and Slack.',
    version: '1.2.1',
    permissions: ['storage', 'activeTab', 'identity', 'webNavigation', 'tabs'],
    host_permissions: ['https://web.whatsapp.com/*', 'https://app.slack.com/*', 'https://www.linkedin.com/*', 'https://api.openai.com/*'],
    icons: {
      128: 'reple-favicon.png',
    },
    browser_specific_settings: {
      gecko: {
        id: 'reple@repleai.site',
        strict_min_version: '109.0',
        // Explicitly state data collection policy to pass validation
        // We set 'none' as we don't passively collect user data (telemetry).
        // Message processing is user-initiated.
        // @ts-ignore: Key not yet in WXT types
        data_collection_permissions: {
          required: ['none']
        }
      }
    },
    action: {
      default_popup: 'popup.html',
      default_title: 'Reple',
      default_icon: {
        128: 'reple-favicon.png',
      },
    },
    web_accessible_resources: [
      {
        resources: ['reple-favicon.png'],
        matches: ['https://web.whatsapp.com/*', 'https://app.slack.com/*', 'https://www.linkedin.com/*'],
      },
    ],
  },
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    base: './',
  }),
});
