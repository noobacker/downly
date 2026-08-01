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
const pluginDir = path.join(vendorDir, 'yt-dlp-plugins');
const pluginPath = path.join(pluginDir, 'bgutil-ytdlp-pot-provider.zip');
const pluginTempPath = `${pluginPath}.download`;
const pluginUrl = process.env.YTDLP_POT_PROVIDER_PLUGIN_URL ||
  'https://github.com/Brainicism/bgutil-ytdlp-pot-provider/releases/latest/download/bgutil-ytdlp-pot-provider.zip';

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
