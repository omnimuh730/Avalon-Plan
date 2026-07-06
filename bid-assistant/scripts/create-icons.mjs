import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sourceIcon = path.join(__dirname, '../mailbox.png');
const outDir = path.join(__dirname, '../public/icons');

if (!fs.existsSync(sourceIcon)) {
  console.error('mailbox.png not found at project root');
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  await sharp(sourceIcon)
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(path.join(outDir, `icon${size}.png`));
}

console.log('Created extension icons from mailbox.png in public/icons/');
