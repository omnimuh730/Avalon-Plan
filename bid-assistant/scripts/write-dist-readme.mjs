import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../dist');

if (!fs.existsSync(distDir)) {
  process.exit(0);
}

fs.writeFileSync(
  path.join(distDir, 'LOAD_THIS_FOLDER_IN_CHROME.txt'),
  [
    'Load THIS folder in chrome://extensions → Load unpacked.',
    '',
    'Do NOT load the parent gmail-assistant project folder.',
    'Loading the project root causes "Service worker registration failed" (status 11)',
    'because Chrome cannot run TypeScript source files directly.',
    '',
    'After code changes: npm run build (or npm run dev), then click Reload on the extension.',
  ].join('\n'),
);
