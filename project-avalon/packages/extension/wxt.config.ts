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
      'sidePanel',
      'storage',
      'downloads',
      'webNavigation',
      'contextMenus',
      'notifications',
      'unlimitedStorage',
      'tabCapture',
      'desktopCapture',
    ],
    host_permissions: ['<all_urls>', 'http://localhost/*', 'ws://localhost/*'],
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
