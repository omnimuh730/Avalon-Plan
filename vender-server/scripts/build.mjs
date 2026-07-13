import esbuild from 'esbuild';
import JavaScriptObfuscator from 'javascript-obfuscator';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');

fs.mkdirSync(distDir, { recursive: true });

console.log('[build] Bundling bridge entry…');
await esbuild.build({
  entryPoints: [path.join(root, 'scripts/bridge.mjs')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: path.join(distDir, 'bridge.bundle.mjs'),
  external: ['dotenv', 'mongodb', 'imapflow', 'mailparser'],
  minify: true,
  legalComments: 'none',
  target: 'node20',
});

console.log('[build] Obfuscating bundle…');
const bundled = fs.readFileSync(path.join(distDir, 'bridge.bundle.mjs'), 'utf8');
const obfuscated = JavaScriptObfuscator.obfuscate(bundled, {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.75,
  deadCodeInjection: false,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  numbersToExpressions: true,
  renameGlobals: false,
  selfDefending: false,
  simplify: true,
  splitStrings: true,
  splitStringsChunkLength: 5,
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 1,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersType: 'variable',
  transformObjectKeys: true,
  unicodeEscapeSequence: false,
}).getObfuscatedCode();

fs.writeFileSync(path.join(distDir, 'bridge.mjs'), obfuscated);
fs.unlinkSync(path.join(distDir, 'bridge.bundle.mjs'));

if (fs.existsSync(path.join(root, '.env.example'))) {
  fs.copyFileSync(path.join(root, '.env.example'), path.join(distDir, '.env.example'));
}

// The job-analysis prompt is embedded in src/config/jobAnalysisPrompt.js and gets
// bundled into bridge.mjs — no prompt.md asset is shipped or required in dist/.

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const distPkg = {
  name: pkg.name,
  version: pkg.version,
  private: true,
  type: 'module',
  scripts: { start: 'node bridge.mjs' },
  dependencies: pkg.dependencies,
};
fs.writeFileSync(path.join(distDir, 'package.json'), `${JSON.stringify(distPkg, null, 2)}\n`);

fs.writeFileSync(
  path.join(distDir, 'README.md'),
  `# vender-server (distribution build)

1. Run \`npm install --omit=dev\` in this folder.
2. Copy \`.env.example\` to \`.env\` and set \`MONGO_URL\`, \`MONGO_DB\`, and \`API_KEYS_ENCRYPTION_KEY\`.
3. Start with \`npm start\`.

Ship this folder together with the built bid-assistant extension (\`bid-assistant/dist\`).
The job-analysis prompt is embedded in \`bridge.mjs\` — no \`prompt.md\` asset is needed.
Resume stacks are loaded from each applier's \`resumeCatalog\` in MongoDB account_info.
`,
);

console.log('[build] Done → dist/bridge.mjs');
