// Reuse the installed Electron runtime/dependencies for a separate local preview.
// Does not change the installation, startup settings, or normal user profile.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const installed = process.argv[2];
const output = process.argv[3];
if (!installed || !output) throw new Error('Usage: node create-local-preview.cjs <installation> <new-output-directory>');
if (fs.existsSync(output) && (!process.argv.includes('--refresh') || !fs.existsSync(path.join(output, 'preview-profile')) || path.resolve(output) === path.resolve(installed))) throw new Error('Output must be a new directory, or an isolated preview with --refresh.');
const root = path.resolve(__dirname, '..');
const sourceArchive = fs.readFileSync(path.join(installed, 'resources', 'app.asar'));
const headerSize = sourceArchive.readUInt32LE(4);
const header = JSON.parse(sourceArchive.subarray(16, 16 + sourceArchive.readUInt32LE(12)).toString('utf8'));
const dataStart = 8 + headerSize;
const replacements = new Map();
const sourceFiles = fs.readdirSync(root).filter(name => /\.(js|css|html)$/.test(name));
function collect(folder) {
  for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
    const file = folder + '/' + entry.name;
    if (entry.isDirectory()) collect(file);
    else if (folder === 'helper' ? /\.(exe|node)$/.test(file) : !/\.(cs|cmd|obj|lib|exp)$/.test(file)) sourceFiles.push(file);
  }
}
for (const folder of ['views', 'prefs', 'mini', 'fonts', 'build', 'helper', 'vendor']) collect(folder);
sourceFiles.push('package.json');
for (const file of sourceFiles) {
  if (!/\.(js|css|html|json)$/.test(file)) {
    replacements.set(file, fs.readFileSync(path.join(root, file))); continue;
  }
  let content = fs.readFileSync(path.join(root, file), 'utf8');
  if (file === 'index.html') content = content.replace('<title>Nova Island</title>', '<title>Nova Island — Glass Preview</title>');
  if (file === 'nova.js') {
    const originalProfile = "app.setPath('userData', path.join(app.getPath('appData'), 'dynamic-nova'));";
    if (!content.includes(originalProfile)) throw new Error('Profile isolation anchor missing');
    content = content.replace(originalProfile, `app.setPath('userData', ${JSON.stringify(path.join(output, 'preview-profile'))});`);
    content = content.replace('  migrateStartup();', '  // Local preview: no startup migration.');
    content = content.replace('  updater.start(send, autoUpdate);', '  // Local preview: no updater.');
    // Optional inspection of the actual input to the optical material. This is
    // captured-pixel data, before any renderer refraction/tint/text is applied.
    content = content.replace("    send('backdrop', { width: b.width, height: b.height, parts });", "    if (process.argv.includes('--glass-diagnostics')) { fs.writeFileSync(path.join(app.getPath('userData'), 'glass-input.png'), Buffer.from(parts[0].url.split(',')[1], 'base64')); fs.writeFileSync(path.join(app.getPath('userData'), 'glass-input.json'), JSON.stringify({ bounds:b, islandRect, protected:win.isContentProtected() })); }\n    send('backdrop', { width: b.width, height: b.height, parts });");
    content = content.replace('y: bounds.y + FLOAT_TOP', 'y: bounds.y + FLOAT_TOP + 96');
    content = content.replace(/    lastLayout = '';\r?\n    layout\(\);/, "    lastLayout = '';\n    layout();\n    send('toggle');");
  }
  replacements.set(file, Buffer.from(content));
}
for (const name of replacements.keys()) {
  const parts = name.split('/');
  let entries = header.files;
  for (const part of parts.slice(0, -1)) { entries[part] ||= { files: {} }; entries = entries[part].files; }
  entries[parts.at(-1)] ||= {};
  if (/\.(exe|dll|node)$/.test(name)) entries[parts.at(-1)].unpacked = true;
}
const buffers = [];
let offset = 0;
function visit(files, prefix = '') {
  for (const [name, entry] of Object.entries(files)) {
    const relative = prefix + name;
    if (entry.files) { visit(entry.files, relative + '/'); continue; }
    if (entry.unpacked || entry.link) {
      if (entry.unpacked && replacements.has(relative)) entry.size = replacements.get(relative).length;
      continue;
    }
    const buffer = replacements.get(relative) || sourceArchive.subarray(dataStart + +entry.offset, dataStart + +entry.offset + entry.size);
    entry.size = buffer.length; entry.offset = String(offset); offset += buffer.length;
    if (replacements.has(relative)) {
      const blockSize = entry.integrity?.blockSize || 4194304;
      const hash = data => crypto.createHash('sha256').update(data).digest('hex');
      const blocks = [];
      for (let i = 0; i < buffer.length; i += blockSize) blocks.push(hash(buffer.subarray(i, i + blockSize)));
      entry.integrity = { algorithm: 'SHA256', hash: hash(buffer), blockSize, blocks };
    }
    buffers.push(buffer);
  }
}
visit(header.files);
const json = Buffer.from(JSON.stringify(header));
const payloadSize = Math.ceil((json.length + 4) / 4) * 4;
const pickle = Buffer.alloc(payloadSize + 4);
pickle.writeUInt32LE(payloadSize, 0); pickle.writeUInt32LE(json.length, 4); json.copy(pickle, 8);
const size = Buffer.alloc(8); size.writeUInt32LE(4, 0); size.writeUInt32LE(pickle.length, 4);
if (!fs.existsSync(output)) fs.cpSync(installed, output, { recursive: true, filter: file => !file.endsWith('Uninstall Nova Island.exe') });
for (const [file, buffer] of replacements) {
  let entry = header; for (const part of file.split('/')) entry = entry.files[part];
  if (!entry.unpacked) continue;
  const dest = path.join(output, 'resources', 'app.asar.unpacked', file);
  fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, buffer);
}
fs.mkdirSync(path.join(output, 'preview-profile'), { recursive: true });
fs.writeFileSync(path.join(output, 'resources', 'app.asar'), Buffer.concat([size, pickle, ...buffers]));
console.log(path.join(output, 'Nova Island.exe'));
