import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: 'src',
  manifest: {
    name: 'Project Avalon',
    description: 'Remote browser control extension for Project Avalon',
    permissions: [
      'tabs',
      'activeTab',
      'scripting',
      'webRequest',
      'sidePanel',
      'storage',
      'downloads',
      'webNavigation',
      'contextMenus',
      'notifications',
      'unlimitedStorage',
      'alarms',
    ],
    host_permissions: [
      '<all_urls>',
      'http://localhost/*',
      'http://127.0.0.1/*',
      'ws://localhost/*',
      'ws://127.0.0.1/*',
    ],
    action: {
      default_title: 'Open Avalon sidebar',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    web_accessible_resources: [
      {
        resources: ['Eli Taylor.docx'],
        matches: ['<all_urls>'],
      },
    ],
  },
  runner: {
    chromiumArgs: ['--auto-open-devtools-for-tabs'],
  },});
