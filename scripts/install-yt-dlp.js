import { execFileSync } from 'child_process';
import fs from 'fs';
import { mkdir, rename, rm } from 'fs/promises';
import https from 'https';
import path from 'path';
import { pipeline } from 'stream/promises';

const shouldInstall = process.env.VERCEL || process.env.DOWNLY_INSTALL_YTDLP === '1';

if (!shouldInstall) {
  console.log('Skipping yt-dlp binary install. Set DOWNLY_INSTALL_YTDLP=1 to install locally.');
  process.exit(0);
}

const assetByPlatform = {
  linux: 'yt-dlp_linux',
  darwin: 'yt-dlp_macos',
  win32: 'yt-dlp.exe'
};
const assetName = assetByPlatform[process.platform];

if (!assetName) {
  throw new Error(`No yt-dlp binary configured for ${process.platform}`);
}

const vendorDir = path.resolve('vendor');
const outputPath = path.join(vendorDir, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const tempPath = `${outputPath}.download`;
const downloadUrl = process.env.YTDLP_DOWNLOAD_URL ||
  `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;

// Pinned (not "latest") so the plugin and the script provider it drives always match versions.
// Bumping requires re-verifying end-to-end (mismatched versions make the plugin refuse to run).
const BGUTIL_VERSION = process.env.YTDLP_POT_PROVIDER_VERSION || '1.3.1';
const pluginDir = path.join(vendorDir, 'yt-dlp-plugins');
const pluginPath = path.join(pluginDir, 'bgutil-ytdlp-pot-provider.zip');
const pluginTempPath = `${pluginPath}.download`;
const pluginUrl = process.env.YTDLP_POT_PROVIDER_PLUGIN_URL ||
  `https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/download/${BGUTIL_VERSION}/bgutil-ytdlp-pot-provider.zip`;

// The plugin only registers yt-dlp providers; the actual PO-token generator (Node/TS) has to be
// built from source. Building it here means the app needs no external PO-token host at runtime.
const bgutilSourceUrl = process.env.YTDLP_POT_PROVIDER_SOURCE_URL ||
  `https://github.com/Brainicism/bgutil-ytdlp-pot-provider/archive/refs/tags/${BGUTIL_VERSION}.tar.gz`;
const bgutilServerDir = path.join(vendorDir, 'bgutil-server');
const bgutilVersionMarker = path.join(bgutilServerDir, '.bgutil-version');
const bgutilGenerateScript = path.join(bgutilServerDir, 'build', 'generate_once.js');

function request(url, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error('Too many redirects while downloading yt-dlp');
  }

  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'downly-build'
      }
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        const location = response.headers.location;
        if (!location) {
          reject(new Error(`Redirect without location while downloading yt-dlp: ${response.statusCode}`));
          return;
        }
        resolve(request(new URL(location, url).href, redirectCount + 1));
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download yt-dlp: HTTP ${response.statusCode}`));
        return;
      }

      resolve(response);
    });

    req.on('error', reject);
  });
}

await mkdir(vendorDir, { recursive: true });
await mkdir(pluginDir, { recursive: true });
await rm(tempPath, { force: true });
await rm(pluginTempPath, { force: true });

console.log(`Downloading yt-dlp from ${downloadUrl}`);
const response = await request(downloadUrl);
await pipeline(response, fs.createWriteStream(tempPath, { mode: 0o755 }));
await rename(tempPath, outputPath);

if (process.platform !== 'win32') {
  fs.chmodSync(outputPath, 0o755);
}

console.log(`Installed yt-dlp to ${outputPath}`);

console.log(`Downloading yt-dlp PO-token provider plugin from ${pluginUrl}`);
const pluginResponse = await request(pluginUrl);
await pipeline(pluginResponse, fs.createWriteStream(pluginTempPath, { mode: 0o600 }));
await rename(pluginTempPath, pluginPath);
console.log(`Installed yt-dlp PO-token provider plugin to ${pluginPath}`);

await installBgutilScriptProvider();

async function installBgutilScriptProvider() {
  const alreadyBuilt = fs.existsSync(bgutilGenerateScript) &&
    fs.existsSync(bgutilVersionMarker) &&
    fs.readFileSync(bgutilVersionMarker, 'utf8').trim() === BGUTIL_VERSION;

  if (alreadyBuilt) {
    console.log(`bgutil PO-token script provider already built for ${BGUTIL_VERSION}, skipping rebuild.`);
    return;
  }

  const sourceTarPath = path.join(vendorDir, 'bgutil-source.tar.gz');
  const extractDir = path.join(vendorDir, `bgutil-source-${process.pid}`);

  await rm(sourceTarPath, { force: true });
  await rm(extractDir, { force: true, recursive: true });
  await mkdir(extractDir, { recursive: true });

  console.log(`Downloading bgutil PO-token provider source from ${bgutilSourceUrl}`);
  const sourceResponse = await request(bgutilSourceUrl);
  await pipeline(sourceResponse, fs.createWriteStream(sourceTarPath));
  execFileSync('tar', ['-xzf', sourceTarPath, '-C', extractDir, '--strip-components=1']);
  await rm(sourceTarPath, { force: true });

  const extractedServerDir = path.join(extractDir, 'server');
  if (!fs.existsSync(extractedServerDir)) {
    throw new Error('bgutil source archive did not contain a server/ directory');
  }

  await rm(bgutilServerDir, { force: true, recursive: true });
  await rename(extractedServerDir, bgutilServerDir);
  await rm(extractDir, { force: true, recursive: true });

  console.log('Installing bgutil PO-token provider dependencies (npm ci)...');
  execFileSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: bgutilServerDir, stdio: 'inherit' });

  console.log('Building bgutil PO-token provider (tsc)...');
  execFileSync('npx', ['tsc'], { cwd: bgutilServerDir, stdio: 'inherit' });

  if (!fs.existsSync(bgutilGenerateScript)) {
    throw new Error('bgutil build did not produce build/generate_once.js');
  }

  console.log('Pruning bgutil PO-token provider dev dependencies...');
  execFileSync('npm', ['prune', '--omit=dev', '--no-audit', '--no-fund'], { cwd: bgutilServerDir, stdio: 'inherit' });

  const leftovers = [
    'src', 'types', 'scripts', 'tsconfig.json', 'tsconfig.tsbuildinfo', 'eslint.config.mjs',
    '.prettierrc.json', 'deno.lock', 'Dockerfile', 'README.md', '.gitattributes'
  ];
  for (const leftover of leftovers) {
    await rm(path.join(bgutilServerDir, leftover), { force: true, recursive: true });
  }

  fs.writeFileSync(bgutilVersionMarker, `${BGUTIL_VERSION}\n`);
  console.log(`Installed bgutil PO-token script provider to ${bgutilServerDir}`);
}
