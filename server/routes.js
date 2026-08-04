import express from 'express';
import { execFile, execFileSync, spawn } from 'child_process';
import { Readable } from 'stream';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const STORAGE_ROOT = process.env.VERCEL
  ? path.join(os.tmpdir(), 'downly')
  : PROJECT_ROOT;
const TEMP_DIR = path.join(STORAGE_ROOT, 'temp');
const DATA_DIR = path.join(STORAGE_ROOT, 'data');
const STATS_PATH = path.join(DATA_DIR, 'stats.json');
const LOCAL_YTDLP_PATH = path.join(PROJECT_ROOT, 'vendor', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
const YTDLP_PATH = process.env.YTDLP_PATH ||
  (fs.existsSync(LOCAL_YTDLP_PATH) ? LOCAL_YTDLP_PATH : 'yt-dlp');
const YTDLP_USER_AGENT = String(process.env.YTDLP_USER_AGENT || '').trim();
const YTDLP_POT_PROVIDER_URL = String(process.env.YTDLP_POT_PROVIDER_URL || '').trim().replace(/\/$/, '');
const YTDLP_ALLOW_COOKIES = process.env.YTDLP_ALLOW_COOKIES === '1';
const YTDLP_USE_COOKIES = YTDLP_ALLOW_COOKIES && (!YTDLP_POT_PROVIDER_URL || process.env.YTDLP_USE_COOKIES_WITH_POT === '1');
const YTDLP_YOUTUBE_PLAYER_CLIENT = String(
  process.env.YTDLP_YOUTUBE_PLAYER_CLIENT || (YTDLP_POT_PROVIDER_URL ? 'mweb' : 'android_vr,web_embedded,web_safari'),
).trim();
const LOCAL_YTDLP_PLUGIN_DIR = path.join(PROJECT_ROOT, 'vendor', 'yt-dlp-plugins');
const YTDLP_PLUGIN_DIR = String(process.env.YTDLP_PLUGIN_DIR || LOCAL_YTDLP_PLUGIN_DIR).trim();
const FFMPEG_PATH = [
  '/opt/homebrew/bin/ffmpeg',
  '/usr/local/bin/ffmpeg',
  '/usr/bin/ffmpeg'
].find(candidate => fs.existsSync(candidate)) || null;

[TEMP_DIR, DATA_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const YTDLP_COOKIES_PATH = YTDLP_ALLOW_COOKIES ? getYtDlpCookiesPath() : '';
const FFMPEG_ENCODERS = getFFmpegEncoders();

const INFO_TIMEOUT_MS = 90000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
const CREATOR_VIDEO_URL = 'https://www.youtube.com/watch?v=c7XrE_d6pzM';
const CREATOR_STATS_CACHE_MS = 10 * 60 * 1000;
let creatorStatsCache = {
  expiresAt: 0,
  data: null
};
const ALLOWED_AUDIO_BITRATES = [64, 128, 160, 192, 256, 320];
const DEFAULT_AUDIO_BITRATE = 192;
const ALLOWED_VIDEO_FPS = [30, 59.94, 60];
const FPS_MATCH_TOLERANCE = 0.08;
const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.leptons.xyz',
  'https://piped-api.privacy.com.de',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt'
];
const PIPED_TIMEOUT_MS = 12000;
const AUDIO_OUTPUT_FORMATS = {
  mp3: {
    id: 'mp3',
    label: 'MP3',
    extension: 'mp3',
    encoders: ['libmp3lame'],
    muxer: 'mp3',
    usesBitrate: true
  },
  m4a: {
    id: 'm4a',
    label: 'M4A / AAC',
    extension: 'm4a',
    encoders: ['aac'],
    muxer: 'mp4',
    usesBitrate: true
  },
  ogg: {
    id: 'ogg',
    label: 'OGG Vorbis',
    extension: 'ogg',
    encoders: ['libvorbis', 'vorbis'],
    experimentalEncoders: ['vorbis'],
    muxer: 'ogg',
    usesBitrate: true
  },
  opus: {
    id: 'opus',
    label: 'Opus',
    extension: 'opus',
    encoders: ['libopus', 'opus'],
    experimentalEncoders: ['opus'],
    muxer: 'opus',
    usesBitrate: true
  },
  flac: {
    id: 'flac',
    label: 'FLAC',
    extension: 'flac',
    encoders: ['flac'],
    muxer: 'flac',
    usesBitrate: false
  },
  wav: {
    id: 'wav',
    label: 'WAV',
    extension: 'wav',
    encoders: ['pcm_s16le'],
    muxer: 'wav',
    usesBitrate: false
  },
  alac: {
    id: 'alac',
    label: 'ALAC',
    extension: 'm4a',
    encoders: ['alac'],
    muxer: 'mp4',
    usesBitrate: false
  }
};
const SUPPORTED_PLATFORMS = [
  { id: 'youtube', label: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'music.youtube.com'] },
  { id: 'instagram', label: 'Instagram', hosts: ['instagram.com', 'instagr.am'] },
  { id: 'tiktok', label: 'TikTok', hosts: ['tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'] },
  { id: 'x', label: 'X / Twitter', hosts: ['x.com', 'twitter.com'] },
  { id: 'facebook', label: 'Facebook', hosts: ['facebook.com', 'fb.watch'] },
  { id: 'vimeo', label: 'Vimeo', hosts: ['vimeo.com'] },
  { id: 'reddit', label: 'Reddit', hosts: ['reddit.com', 'redd.it', 'v.redd.it'] },
  { id: 'soundcloud', label: 'SoundCloud', hosts: ['soundcloud.com', 'on.soundcloud.com'] },
  { id: 'twitch', label: 'Twitch', hosts: ['twitch.tv', 'clips.twitch.tv'] },
  { id: 'dailymotion', label: 'Dailymotion', hosts: ['dailymotion.com', 'dai.ly'] }
];
const SUPPORTED_PLATFORM_LABELS = SUPPORTED_PLATFORMS.map(platform => platform.label).join(', ');

function getUrlWithProtocol(url) {
  const trimmedUrl = String(url || '').trim();
  if (/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;
  return `https://${trimmedUrl}`;
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/^m\./, '')
    .replace(/^mobile\./, '')
    .replace(/^web\./, '');
}

function hostMatches(hostname, platformHost) {
  return hostname === platformHost || hostname.endsWith(`.${platformHost}`);
}

function getSupportedPlatform(parsedUrl) {
  const hostname = normalizeHostname(parsedUrl.hostname);
  return SUPPORTED_PLATFORMS.find(platform =>
    platform.hosts.some(host => hostMatches(hostname, host))
  ) || null;
}

function getVideoIdFromPath(url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const videoPathPrefixes = new Set(['shorts', 'embed', 'live', 'v']);

  if (url.hostname === 'youtu.be') return parts[0] || '';
  if (videoPathPrefixes.has(parts[0])) return parts[1] || '';
  return '';
}

function normalizeYouTubeURL(url) {
  try {
    const parsedUrl = new URL(getUrlWithProtocol(url));
    const hostname = normalizeHostname(parsedUrl.hostname);

    if (!['youtube.com', 'music.youtube.com', 'youtu.be'].includes(hostname)) return '';

    const videoId = parsedUrl.searchParams.get('v') || getVideoIdFromPath(parsedUrl);
    if (!/^[\w-]{6,}$/.test(videoId || '')) return '';

    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch (error) {
    return '';
  }
}

function getYouTubeVideoId(normalizedUrl) {
  try {
    return new URL(normalizedUrl).searchParams.get('v') || '';
  } catch (error) {
    return '';
  }
}

function encodeRelayStreamUrl(url) {
  return `relay:${Buffer.from(url).toString('base64url')}`;
}

function decodeRelayStreamUrl(formatId) {
  if (!String(formatId || '').startsWith('relay:')) return '';

  try {
    const url = Buffer.from(String(formatId).slice(6), 'base64url').toString('utf8');
    const parsed = new URL(url);
    const allowedHost = PIPED_INSTANCES.some(instance => {
      const instanceHost = new URL(instance).hostname;
      return parsed.hostname === instanceHost || parsed.hostname.endsWith(`.${instanceHost}`);
    });
    return parsed.protocol === 'https:' && allowedHost ? parsed.href : '';
  } catch (error) {
    return '';
  }
}

function parsePipedBitrate(stream) {
  const quality = String(stream.quality || '');
  const qualityMatch = quality.match(/(\d+(?:\.\d+)?)\s*kbps/i);
  if (qualityMatch) return Number(qualityMatch[1]);

  const bitrate = Number(stream.bitrate) || 0;
  return bitrate > 10000 ? bitrate / 1000 : bitrate;
}

async function fetchPipedStreams(normalizedUrl) {
  const videoId = getYouTubeVideoId(normalizedUrl);
  if (!videoId) return null;

  for (const instance of PIPED_INSTANCES) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PIPED_TIMEOUT_MS);

    try {
      const response = await fetch(`${instance}/streams/${encodeURIComponent(videoId)}`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal
      });
      if (!response.ok) continue;

      const data = await response.json();
      if (data?.title && (Array.isArray(data.audioStreams) || Array.isArray(data.videoStreams))) {
        return data;
      }
    } catch (error) {
      console.warn(`Piped instance unavailable (${instance}):`, error.message);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

function mapPipedStreams(data) {
  const videoStreams = (data.videoStreams || [])
    .filter(stream => stream?.url && stream?.mimeType?.startsWith('video/'))
    .map(stream => ({
      id: encodeRelayStreamUrl(stream.url),
      quality: stream.quality || `${stream.height || 0}p`,
      resolution: stream.width && stream.height ? `${stream.width}x${stream.height}` : 'Unknown',
      fps: Number(stream.fps) || 'Unknown',
      codec: String(stream.codec || 'Unknown').split('.')[0],
      container: stream.format === 'WEBM' ? 'webm' : 'mp4',
      filesize: Number(stream.contentLength) || null,
      hdr: 'No',
      height: Number(stream.height) || 0,
      videoOnly: Boolean(stream.videoOnly)
    }));
  const audioStreams = (data.audioStreams || [])
    .filter(stream => stream?.url && stream?.mimeType?.startsWith('audio/'))
    .map(stream => ({
      id: encodeRelayStreamUrl(stream.url),
      bitrate: stream.quality || 'Unknown',
      codec: String(stream.codec || 'Unknown').split('.')[0],
      container: stream.format === 'WEBM' ? 'webm' : 'm4a',
      channels: 'Unknown',
      sampleRate: 'Unknown',
      filesize: Number(stream.contentLength) || null,
      abr: parsePipedBitrate(stream)
    }));

  return {
    video: videoStreams.filter(stream => stream.videoOnly),
    audio: audioStreams,
    progressive: videoStreams.filter(stream => !stream.videoOnly)
  };
}

function normalizeMediaURL(url) {
  try {
    const parsedUrl = new URL(getUrlWithProtocol(url));
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return { url: '', platform: null };

    const platform = getSupportedPlatform(parsedUrl);
    if (!platform) return { url: '', platform: null };

    if (platform.id === 'youtube') {
      const normalizedYouTubeUrl = normalizeYouTubeURL(url);
      return {
        url: normalizedYouTubeUrl,
        platform: normalizedYouTubeUrl ? platform : null
      };
    }

    parsedUrl.hash = '';
    return { url: parsedUrl.href, platform };
  } catch (error) {
    return { url: '', platform: null };
  }
}

function validateURL(url) {
  return Boolean(normalizeMediaURL(url).url);
}

function getDefaultStats() {
  return {
    downloadCount: 0,
    totalDownloadCount: 0,
    videoDownloadCount: 0,
    audioDownloadCount: 0,
    updatedAt: null
  };
}

function normalizeStatsCount(value) {
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function normalizeStats(stats) {
  const legacyCount = normalizeStatsCount(stats?.downloadCount);
  const hasSplitStats = stats &&
    (
      Object.prototype.hasOwnProperty.call(stats, 'totalDownloadCount') ||
      Object.prototype.hasOwnProperty.call(stats, 'videoDownloadCount') ||
      Object.prototype.hasOwnProperty.call(stats, 'audioDownloadCount')
    );
  const audioDownloadCount = normalizeStatsCount(stats?.audioDownloadCount);
  const videoDownloadCount = hasSplitStats
    ? normalizeStatsCount(stats?.videoDownloadCount)
    : legacyCount;
  const explicitTotal = normalizeStatsCount(stats?.totalDownloadCount);
  const totalDownloadCount = hasSplitStats
    ? Math.max(explicitTotal, videoDownloadCount + audioDownloadCount)
    : legacyCount;

  return {
    downloadCount: totalDownloadCount,
    totalDownloadCount,
    videoDownloadCount,
    audioDownloadCount,
    updatedAt: typeof stats?.updatedAt === 'string' ? stats.updatedAt : null
  };
}

function readStats() {
  try {
    if (!fs.existsSync(STATS_PATH)) return getDefaultStats();
    return normalizeStats(JSON.parse(fs.readFileSync(STATS_PATH, 'utf8')));
  } catch (error) {
    console.error('Stats read error:', error.message);
    return getDefaultStats();
  }
}

function writeStats(stats) {
  const normalizedStats = normalizeStats(stats);
  const tempPath = `${STATS_PATH}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalizedStats, null, 2)}\n`);
  fs.renameSync(tempPath, STATS_PATH);
  return normalizedStats;
}

function normalizeDownloadType(type) {
  return type === 'audio' ? 'audio' : 'video';
}

function incrementDownloadCount(type = 'video') {
  const stats = readStats();
  const downloadType = normalizeDownloadType(type);
  const nextVideoDownloadCount = stats.videoDownloadCount + (downloadType === 'video' ? 1 : 0);
  const nextAudioDownloadCount = stats.audioDownloadCount + (downloadType === 'audio' ? 1 : 0);

  return writeStats({
    downloadCount: stats.totalDownloadCount + 1,
    totalDownloadCount: stats.totalDownloadCount + 1,
    videoDownloadCount: nextVideoDownloadCount,
    audioDownloadCount: nextAudioDownloadCount,
    updatedAt: new Date().toISOString()
  });
}

function sanitizeDownloadName(filename) {
  const sanitized = String(filename || '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 160);

  return sanitized || 'download';
}

function normalizeDownloadExtension(extension) {
  const normalized = String(extension || '')
    .trim()
    .toLowerCase()
    .replace(/^\./, '');

  if (!/^[a-z0-9]{1,12}$/.test(normalized) || normalized === 'unknown') return '';
  return normalized;
}

function getAudioOutputFormat(outputFormat) {
  const normalized = String(outputFormat || '').trim().toLowerCase();
  return AUDIO_OUTPUT_FORMATS[normalized] || null;
}

function getFFmpegEncoders() {
  if (!FFMPEG_PATH) return new Set();

  try {
    const output = execFileSync(FFMPEG_PATH, ['-hide_banner', '-encoders'], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    });

    return new Set(
      [...output.matchAll(/^\s*[A-Z.]{6}\s+(\S+)/gm)].map(match => match[1])
    );
  } catch (error) {
    console.error('Could not inspect FFmpeg encoders:', error.message);
    return new Set();
  }
}

function getAudioOutputEncoder(format) {
  return format.encoders.find(encoder => FFMPEG_ENCODERS.has(encoder)) || '';
}

function isAudioOutputFormatSupported(format) {
  return Boolean(FFMPEG_PATH && getAudioOutputEncoder(format));
}

function getAudioConversionCapabilities() {
  if (!FFMPEG_PATH) {
    return {
      bitrates: [],
      bitrateFormats: [],
      losslessFormats: []
    };
  }

  const formats = Object.values(AUDIO_OUTPUT_FORMATS).map(format => ({
    id: format.id,
    label: format.label,
    extension: format.extension
  })).filter(format => isAudioOutputFormatSupported(AUDIO_OUTPUT_FORMATS[format.id]));

  return {
    bitrates: ALLOWED_AUDIO_BITRATES,
    bitrateFormats: formats.filter(format => AUDIO_OUTPUT_FORMATS[format.id].usesBitrate),
    losslessFormats: formats.filter(format => !AUDIO_OUTPUT_FORMATS[format.id].usesBitrate)
  };
}

function getDownloadExtension({ outputFormat, mergeOutputFormat, container }) {
  return getAudioOutputFormat(outputFormat)?.extension ||
    normalizeDownloadExtension(outputFormat) ||
    normalizeDownloadExtension(mergeOutputFormat) ||
    normalizeDownloadExtension(container) ||
    'mp4';
}

function normalizeAudioBitrate(value) {
  const bitrate = Number(value) || DEFAULT_AUDIO_BITRATE;
  return ALLOWED_AUDIO_BITRATES.includes(bitrate) ? bitrate : 0;
}

function normalizeVideoFPS(value) {
  if (value === undefined || value === null || value === '') return 0;

  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) return 0;

  const allowedFPS = ALLOWED_VIDEO_FPS.find(target =>
    Math.abs(target - fps) <= FPS_MATCH_TOLERANCE
  );

  return allowedFPS || 0;
}

function getVideoFPSFilterValue(fps) {
  if (Math.abs(fps - 59.94) <= FPS_MATCH_TOLERANCE) return '60000/1001';
  return String(Math.round(fps));
}

function getDownloadMimeType(extension) {
  const mimeTypes = {
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mka: 'audio/x-matroska',
    mkv: 'video/x-matroska',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    opus: 'audio/ogg',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'video/webm'
  };

  return mimeTypes[extension] || 'application/octet-stream';
}

function encodeRFC5987Value(value) {
  return encodeURIComponent(value)
    .replace(/['()]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

function getResponseFilename(requestedFilename, extension) {
  const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filenameBase = sanitizeDownloadName(requestedFilename || 'download')
    .replace(new RegExp(`\\.${escapedExtension}$`, 'i'), '');

  return `${filenameBase}.${extension}`;
}

function setDownloadHeaders(res, filename, extension) {
  const fallbackFilename = filename.replace(/["\\]/g, '_');

  res.status(200);
  res.setHeader('Content-Type', getDownloadMimeType(extension));
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${fallbackFilename}"; filename*=UTF-8''${encodeRFC5987Value(filename)}`
  );
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function getProcessErrorDetails(error, fallback) {
  if (error?.code === 'ENOENT') {
    return `yt-dlp executable not found. Expected "${YTDLP_PATH}". On Vercel, make sure the build installs vendor/yt-dlp and includes it in the function bundle.`;
  }

  const output = [error.stderr, error.stdout]
    .filter(Boolean)
    .join('\n');
  const youtubeAuthError = getYoutubeAuthErrorDetails(output || error.message || '');
  if (youtubeAuthError) return youtubeAuthError;
  const youtubePotError = getYoutubePotErrorDetails(output || error.message || '');
  if (youtubePotError) return youtubePotError;

  const lines = (output || error.message || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line =>
      line &&
      !line.startsWith('Command failed:') &&
      !line.startsWith('Deprecated Feature:')
    );
  const errorLine = [...lines].reverse().find(line => /^ERROR:/i.test(line)) || lines.at(-1);
  return errorLine ? errorLine.replace(/^ERROR:\s*/i, '') : fallback;
}

function hasConfiguredYtDlpCookies() {
  return Boolean(YTDLP_COOKIES_PATH && YTDLP_USE_COOKIES);
}

function isYoutubeBotCheckError(message) {
  return /sign in to confirm.*not a bot|confirm.*you(?:'|\u2019)?re not a bot|use --cookies-from-browser|use --cookies/i.test(String(message || ''));
}

function getYoutubeAuthErrorDetails(message) {
  if (!isYoutubeBotCheckError(message)) return '';

  if (YTDLP_POT_PROVIDER_URL) {
    return 'YouTube bot protection is still active. The automatic PO-token provider did not satisfy this request; check that YTDLP_POT_PROVIDER_URL points to a running, publicly reachable bgutil provider.';
  }

  if (hasConfiguredYtDlpCookies()) {
    return 'YouTube rejected the configured cookies. Export fresh youtube.com cookies in Netscape format, update YTDLP_COOKIES_BASE64 or YTDLP_COOKIES, keep YTDLP_USER_AGENT matched to the browser if needed, then redeploy.';
  }

  return 'YouTube did not allow anonymous extraction from this server. No account cookies or personal browser data are being used. Try a public, embeddable video or retry later.';
}

function getYoutubePotErrorDetails(message) {
  if (!YTDLP_POT_PROVIDER_URL) return '';
  if (!/bgutil|po token|pot provider|connection refused|failed to fetch/i.test(String(message || ''))) {
    return '';
  }

  return 'The automatic YouTube PO-token provider is unavailable. Check YTDLP_POT_PROVIDER_URL and make sure the bgutil provider service is running and reachable from Vercel.';
}

function normalizeCookiesText(cookies) {
  const normalized = String(cookies || '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  return normalized.includes('\n')
    ? normalized.trim()
    : normalized.replace(/\\n/g, '\n').trim();
}

function hasNetscapeCookieHeader(cookies) {
  return cookies.startsWith('# HTTP Cookie File') ||
    cookies.startsWith('# Netscape HTTP Cookie File');
}

function hasYoutubeCookieRows(cookies) {
  return /(^|\n)[^\n#]*\.?youtube\.com\t/i.test(cookies);
}

function getYtDlpCookiesPath() {
  const configuredPath = String(process.env.YTDLP_COOKIES_PATH || '').trim();
  if (configuredPath) {
    const resolvedPath = path.isAbsolute(configuredPath)
      ? configuredPath
      : path.join(PROJECT_ROOT, configuredPath);

    if (!fs.existsSync(resolvedPath)) {
      console.warn(`YTDLP_COOKIES_PATH does not exist: ${resolvedPath}`);
      return '';
    }

    try {
      const cookies = normalizeCookiesText(fs.readFileSync(resolvedPath, 'utf8'));
      if (!hasNetscapeCookieHeader(cookies)) {
        console.warn('YTDLP_COOKIES_PATH must point to a Netscape cookies.txt file starting with "# HTTP Cookie File" or "# Netscape HTTP Cookie File".');
        return '';
      }

      if (!hasYoutubeCookieRows(cookies)) {
        console.warn('YTDLP_COOKIES_PATH does not contain youtube.com cookie rows. YouTube authentication may still fail.');
      }
    } catch (error) {
      console.warn(`Could not read YTDLP_COOKIES_PATH: ${error.message}`);
      return '';
    }

    console.log('Using yt-dlp cookies from YTDLP_COOKIES_PATH.');
    return resolvedPath;
  }

  const rawCookies = String(process.env.YTDLP_COOKIES || '').trim();
  const encodedCookies = String(process.env.YTDLP_COOKIES_BASE64 || '').trim();
  if (!rawCookies && !encodedCookies) return '';

  const sourceName = rawCookies ? 'YTDLP_COOKIES' : 'YTDLP_COOKIES_BASE64';

  try {
    const cookies = normalizeCookiesText(
      rawCookies || Buffer.from(encodedCookies.replace(/\s+/g, ''), 'base64').toString('utf8')
    );
    const cookiesPath = path.join(DATA_DIR, 'youtube-cookies.txt');

    if (!cookies) {
      console.warn(`${sourceName} is empty after decoding.`);
      return '';
    }

    if (!hasNetscapeCookieHeader(cookies)) {
      console.warn(`${sourceName} must be a Netscape cookies.txt file starting with "# HTTP Cookie File" or "# Netscape HTTP Cookie File".`);
      return '';
    }

    if (!hasYoutubeCookieRows(cookies)) {
      console.warn(`${sourceName} does not contain youtube.com cookie rows. YouTube authentication may still fail.`);
    }

    fs.writeFileSync(cookiesPath, `${cookies}\n`, { mode: 0o600 });
    console.log(`Using yt-dlp cookies from ${sourceName}.`);
    return cookiesPath;
  } catch (error) {
    console.error('Could not write yt-dlp cookies file:', error.message);
    return '';
  }
}

function getYtDlpAuthArgs() {
  const args = [];

  if (YTDLP_COOKIES_PATH && YTDLP_USE_COOKIES) {
    args.push('--cookies', YTDLP_COOKIES_PATH);
  }

  if (YTDLP_USER_AGENT) {
    args.push('--user-agent', YTDLP_USER_AGENT);
  }

  if (YTDLP_YOUTUBE_PLAYER_CLIENT) {
    args.push(
      '--extractor-args',
      `youtube:player_client=${YTDLP_YOUTUBE_PLAYER_CLIENT}`,
    );
  }

  if (YTDLP_POT_PROVIDER_URL) {
    args.push(
      '--extractor-args',
      `youtubepot-bgutilhttp:base_url=${YTDLP_POT_PROVIDER_URL}`,
    );
  }

  if (fs.existsSync(YTDLP_PLUGIN_DIR)) {
    args.push('--plugin-dirs', YTDLP_PLUGIN_DIR);
  }

  return args;
}

function canStreamDirectDownload({ formatId, outputFormat, mergeOutputFormat, videoFps }) {
  return Boolean(formatId && !formatId.includes('+') && !outputFormat && !mergeOutputFormat && !videoFps);
}

function canStreamMergedDownload({ formatId, outputFormat, mergeOutputFormat, videoFps }) {
  return Boolean(formatId && formatId.includes('+') && !outputFormat && mergeOutputFormat && !videoFps && FFMPEG_PATH);
}

function getMergedStreamArgs(mergeOutputFormat) {
  const args = [
    '--downloader',
    'ffmpeg',
    '--ffmpeg-location',
    FFMPEG_PATH,
    '--merge-output-format',
    mergeOutputFormat
  ];

  if (mergeOutputFormat === 'mp4') {
    args.push('--downloader-args', 'ffmpeg_o:-f mp4 -movflags frag_keyframe+empty_moov');
  } else if (mergeOutputFormat === 'webm') {
    args.push('--downloader-args', 'ffmpeg_o:-f webm');
  } else if (mergeOutputFormat === 'mkv') {
    args.push('--downloader-args', 'ffmpeg_o:-f matroska');
  }

  return args;
}

function streamYtDlpDownload({ normalizedUrl, formatId, filename, extension, res, mergeOutputFormat = '' }) {
  return new Promise(resolve => {
    const isMergedStream = Boolean(mergeOutputFormat);
    const ytDlpArgs = [
      '-f',
      formatId,
      '-o',
      '-',
      '--no-warnings',
      '--no-progress',
      '--no-playlist',
      '--socket-timeout',
      '20',
      ...(isMergedStream ? getMergedStreamArgs(mergeOutputFormat) : ['--concurrent-fragments', '4']),
      ...getYtDlpAuthArgs(),
      normalizedUrl
    ];
    const downloadProcess = spawn(YTDLP_PATH, ytDlpArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stderr = '';
    let stdoutEnded = false;
    let sentDownloadHeaders = false;
    let settled = false;

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    downloadProcess.stderr.on('data', chunk => {
      stderr += chunk.toString();
      if (stderr.length > 65536) stderr = stderr.slice(-65536);
    });

    downloadProcess.stdout.on('end', () => {
      stdoutEnded = true;
    });

    const startDownloadResponse = () => {
      if (!sentDownloadHeaders) {
        sentDownloadHeaders = true;
        setDownloadHeaders(res, filename, extension);
      }
    };

    downloadProcess.stdout.once('data', chunk => {
      startDownloadResponse();
      res.write(chunk);
      downloadProcess.stdout.pipe(res);
    });

    downloadProcess.once('error', error => {
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Download failed',
          details: getProcessErrorDetails(error, 'Could not start downloader')
        });
      } else {
        res.destroy(error);
      }
      finish();
    });

    res.once('close', () => {
      if (!stdoutEnded && !downloadProcess.killed) {
        downloadProcess.kill('SIGTERM');
      }
    });

    downloadProcess.once('close', code => {
      if (code && code !== 0 && !res.destroyed) {
        const details = getProcessErrorDetails({ stderr }, 'Unable to stream this format');
        if (!res.headersSent) {
          res.status(400).json({ error: 'Download failed', details });
        } else {
          res.destroy(new Error(details));
        }
      } else if (!res.writableEnded && !res.destroyed) {
        if (!res.headersSent) startDownloadResponse();
        res.end();
      }
      finish();
    });
  });
}

async function streamRelayDownload({ streamUrl, filename, extension, res }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(streamUrl, {
      headers: { 'User-Agent': 'Downly/1.0' },
      signal: controller.signal
    });

    if (!response.ok || !response.body) {
      throw new Error(`Relay returned HTTP ${response.status}`);
    }

    setDownloadHeaders(res, filename, extension);
    const contentLength = response.headers.get('content-length');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    res.once('close', () => controller.abort());
    Readable.fromWeb(response.body).pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      res.status(400).json({ error: 'Download failed', details: 'The anonymous relay is unavailable. Please retry.' });
    } else if (!res.destroyed) {
      res.destroy(error);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function getAudioConversionStreamArgs(format, audioBitrate) {
  const encoder = getAudioOutputEncoder(format);
  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-vn',
    '-map',
    '0:a:0',
    '-codec:a',
    encoder
  ];

  if (format.experimentalEncoders?.includes(encoder)) {
    args.push('-strict', '-2');
  }

  if (format.usesBitrate) {
    args.push('-b:a', `${audioBitrate}k`);
  }

  if (format.muxer === 'mp4') {
    args.push(
      '-f',
      'mp4',
      '-movflags',
      'frag_keyframe+empty_moov+default_base_moof',
      'pipe:1'
    );
    return args;
  }

  args.push('-f', format.muxer, 'pipe:1');
  return args;
}

function getConversionStreamArgs({ outputFormat, audioBitrate, videoFps }) {
  const audioOutputFormat = getAudioOutputFormat(outputFormat);
  if (audioOutputFormat) return getAudioConversionStreamArgs(audioOutputFormat, audioBitrate);

  return [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    'pipe:0',
    '-map',
    '0:v:0',
    '-map',
    '0:a?',
    '-vf',
    `fps=${getVideoFPSFilterValue(videoFps)}`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '23',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  ];
}

function streamConvertedDownload({
  normalizedUrl,
  formatId,
  filename,
  extension,
  res,
  outputFormat = '',
  audioBitrate = 0,
  videoFps = 0,
  mergeOutputFormat = ''
}) {
  return new Promise(resolve => {
    const isMergedInput = Boolean(mergeOutputFormat);
    const ytDlpArgs = [
      '-f',
      formatId,
      '-o',
      '-',
      '--no-warnings',
      '--no-progress',
      '--no-playlist',
      '--socket-timeout',
      '20',
      ...(isMergedInput ? getMergedStreamArgs(mergeOutputFormat) : ['--concurrent-fragments', '4']),
      ...getYtDlpAuthArgs(),
      normalizedUrl
    ];
    const ffmpegArgs = getConversionStreamArgs({ outputFormat, audioBitrate, videoFps });
    const downloadProcess = spawn(YTDLP_PATH, ytDlpArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    const ffmpegProcess = spawn(FFMPEG_PATH, ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    let stderr = '';
    let sentDownloadHeaders = false;
    let settled = false;

    const appendStderr = chunk => {
      stderr += chunk.toString();
      if (stderr.length > 65536) stderr = stderr.slice(-65536);
    };

    const startDownloadResponse = () => {
      if (!sentDownloadHeaders && !res.destroyed) {
        sentDownloadHeaders = true;
        setDownloadHeaders(res, filename, extension);
      }
    };

    const stopProcesses = () => {
      if (!downloadProcess.killed) downloadProcess.kill('SIGTERM');
      if (!ffmpegProcess.killed) ffmpegProcess.kill('SIGTERM');
    };

    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const fail = (error, fallback, status = 400) => {
      if (settled) return;
      const details = getProcessErrorDetails(error, fallback);
      stopProcesses();
      if (!res.headersSent && !sentDownloadHeaders) {
        res.status(status).json({ error: 'Download failed', details });
      } else if (!res.destroyed) {
        res.destroy(new Error(details));
      }
      finish();
    };

    downloadProcess.stderr.on('data', appendStderr);
    ffmpegProcess.stderr.on('data', appendStderr);

    downloadProcess.stdout.on('error', error => {
      if (error.code !== 'EPIPE') appendStderr(Buffer.from(error.message));
    });

    ffmpegProcess.stdin.on('error', error => {
      if (error.code !== 'EPIPE') appendStderr(Buffer.from(error.message));
    });

    downloadProcess.stdout.pipe(ffmpegProcess.stdin);

    ffmpegProcess.stdout.once('data', chunk => {
      startDownloadResponse();
      res.write(chunk);
      ffmpegProcess.stdout.pipe(res);
    });

    downloadProcess.once('error', error => {
      fail(error, 'Could not start downloader', 500);
    });

    ffmpegProcess.once('error', error => {
      fail(error, 'Could not start converter', 500);
    });

    res.once('close', () => {
      if (!settled && !res.writableEnded) {
        stopProcesses();
        finish();
      }
    });

    downloadProcess.once('close', code => {
      if (code && code !== 0 && !settled) {
        fail({ stderr }, 'Unable to fetch media for conversion');
      }
    });

    ffmpegProcess.once('close', code => {
      if (code && code !== 0 && !settled) {
        fail({ stderr }, 'Unable to stream converted media');
        return;
      }

      if (!res.writableEnded && !res.destroyed) {
        startDownloadResponse();
        res.end();
      }
      finish();
    });
  });
}

function isInsideTempDir(filePath) {
  const resolvedTempDir = path.resolve(TEMP_DIR);
  const resolvedFilePath = path.resolve(filePath);
  return resolvedFilePath === resolvedTempDir || resolvedFilePath.startsWith(`${resolvedTempDir}${path.sep}`);
}

function findDownloadedFile(prefix) {
  const prefixName = path.basename(prefix);
  const candidates = fs.readdirSync(TEMP_DIR)
    .filter(file => file === prefixName || file.startsWith(`${prefixName}.`))
    .map(file => path.join(TEMP_DIR, file))
    .filter(file => fs.statSync(file).isFile())
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

  return candidates[0] || null;
}

function hasVideo(format) {
  return Boolean(
    (format.vcodec && format.vcodec !== 'none') ||
    (format.video_ext && format.video_ext !== 'none')
  );
}

function hasAudio(format) {
  return Boolean(
    (format.acodec && format.acodec !== 'none') ||
    (format.audio_ext && format.audio_ext !== 'none')
  );
}

function isDownloadableMediaFormat(format) {
  const extension = format.ext || '';
  const note = `${format.format || ''} ${format.format_note || ''}`.toLowerCase();

  return Boolean(
    format.format_id &&
    extension &&
    !['mhtml', 'jpg', 'jpeg', 'png'].includes(extension) &&
    !note.includes('storyboard') &&
    (hasVideo(format) || hasAudio(format))
  );
}

function extractQuality(format) {
  if (format.height) return `${format.height}p`;
  if (format.format_note) return format.format_note;
  if (format.format) {
    const match = format.format.match(/(\d+p)/);
    if (match) return match[1];
  }
  return 'Unknown';
}

function getFilesize(format) {
  return format.filesize || format.filesize_approx || null;
}

function getVideoHeight(format) {
  return Number(format.height) || 0;
}

function extractFPS(format) {
  const fpsCandidates = [];
  const directFPS = Number(format.fps);
  if (Number.isFinite(directFPS) && directFPS > 0) {
    fpsCandidates.push(directFPS);
  }

  const details = [
    format.format_note,
    format.format,
    format.resolution
  ].filter(Boolean).join(' ');

  for (const match of details.matchAll(/\b(\d+(?:\.\d+)?)\s*fps\b/gi)) {
    fpsCandidates.push(Number(match[1]));
  }

  for (const match of details.matchAll(/\b\d{3,4}p(\d{2,3})(?:\b|[^\d])/gi)) {
    fpsCandidates.push(Number(match[1]));
  }

  const fps = Math.max(...fpsCandidates.filter(value => Number.isFinite(value) && value > 0), 0);
  return Number.isInteger(fps) ? fps : Number(fps.toFixed(2));
}

function getThumbnailScore(thumbnail) {
  const width = Number(thumbnail.width) || 0;
  const height = Number(thumbnail.height) || 0;
  const preference = Number(thumbnail.preference) || 0;
  const url = String(thumbnail.url || '').toLowerCase();
  const id = String(thumbnail.id || '').toLowerCase();
  const label = `${url} ${id}`;
  const qualityBonus =
    (label.includes('maxres') ? 1_000_000 : 0) +
    (label.includes('hq720') ? 750_000 : 0) +
    (label.includes('sddefault') ? 500_000 : 0) +
    (label.includes('hqdefault') ? 250_000 : 0);

  return width * height + preference + qualityBonus;
}

function selectBestThumbnail(videoData) {
  const thumbnails = Array.isArray(videoData.thumbnails) ? videoData.thumbnails : [];
  const bestThumbnail = thumbnails
    .filter(thumbnail => thumbnail?.url)
    .sort((a, b) => getThumbnailScore(b) - getThumbnailScore(a))[0];

  return bestThumbnail?.url || videoData.thumbnail || '';
}

function mapVideoFormat(format) {
  const fps = extractFPS(format);

  return {
    id: format.format_id,
    quality: extractQuality(format),
    resolution: format.height && format.width ? `${format.width}x${format.height}` : (format.resolution || 'Unknown'),
    fps: fps || 'Unknown',
    codec: (format.vcodec || 'Unknown').split('.')[0],
    container: format.ext || 'Unknown',
    filesize: getFilesize(format),
    hdr: format.dynamic_range && format.dynamic_range !== 'SDR' ? format.dynamic_range : 'No',
    height: getVideoHeight(format)
  };
}

function mapAudioFormat(format) {
  return {
    id: format.format_id,
    bitrate: format.abr ? `${format.abr} kbps` : (format.format_note || 'Unknown'),
    codec: (format.acodec || 'Unknown').split('.')[0],
    container: format.ext || 'Unknown',
    channels: format.audio_channels || 'Unknown',
    sampleRate: format.asr ? `${Math.round(format.asr / 1000)} kHz` : 'Unknown',
    filesize: getFilesize(format),
    abr: Number(format.abr) || 0
  };
}

function selectBestAudioFormat(audioFormats, mergeOutputFormat) {
  const preferredExtensions = mergeOutputFormat === 'webm' ? ['webm'] : ['m4a', 'mp4'];
  const preferredAudioFormats = audioFormats.filter(format =>
    preferredExtensions.includes(format.ext)
  );
  const candidates = preferredAudioFormats.length > 0 ? preferredAudioFormats : audioFormats;

  return [...candidates].sort((a, b) =>
    (Number(b.abr) || 0) - (Number(a.abr) || 0) ||
    (Number(getFilesize(b)) || 0) - (Number(getFilesize(a)) || 0)
  )[0];
}

function createMergedProgressiveFormats(videoFormats, audioFormats) {
  if (!FFMPEG_PATH || audioFormats.length === 0) return [];

  return videoFormats
    .map(videoFormat => {
      const mergeOutputFormat = ['mp4', 'webm'].includes(videoFormat.ext) ? videoFormat.ext : 'mkv';
      const audioFormat = selectBestAudioFormat(audioFormats, mergeOutputFormat);
      if (!audioFormat) return null;

      const videoSize = getFilesize(videoFormat);
      const audioSize = getFilesize(audioFormat);
      const mappedFormat = mapVideoFormat(videoFormat);

      return {
        ...mappedFormat,
        id: `${videoFormat.format_id}+${audioFormat.format_id}`,
        container: mergeOutputFormat,
        filesize: videoSize && audioSize ? videoSize + audioSize : videoSize || null,
        merged: true,
        mergeOutputFormat,
        audioCodec: (audioFormat.acodec || 'Unknown').split('.')[0]
      };
    })
    .filter(Boolean);
}

router.get('/stats', (req, res) => {
  res.json(readStats());
});

router.get('/creator-stats', async (req, res) => {
  if (creatorStatsCache.data && creatorStatsCache.expiresAt > Date.now()) {
    return res.json(creatorStatsCache.data);
  }

  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, [
      '-j',
      '--no-warnings',
      '--no-playlist',
      '--skip-download',
      '--ignore-no-formats-error',
      '--socket-timeout',
      '20',
      ...getYtDlpAuthArgs(),
      CREATOR_VIDEO_URL
    ], {
      maxBuffer: 8 * 1024 * 1024,
      timeout: INFO_TIMEOUT_MS
    });

    const videoData = JSON.parse(stdout);
    const data = {
      views: Number(videoData.view_count) || 0,
      title: videoData.title || '',
      updatedAt: new Date().toISOString()
    };

    creatorStatsCache = {
      data,
      expiresAt: Date.now() + CREATOR_STATS_CACHE_MS
    };

    return res.json(data);
  } catch (error) {
    console.warn('Creator stats unavailable:', getProcessErrorDetails(error, 'Unable to fetch creator stats'));
    return res.status(503).json({ error: 'Creator stats unavailable' });
  }
});

router.post('/stats/increment', (req, res) => {
  try {
    const { url, type } = req.body || {};

    if (!url || typeof url !== 'string' || !validateURL(url)) {
      return res.status(400).json({ error: 'Valid media URL is required' });
    }

    if (type && !['video', 'audio'].includes(type)) {
      return res.status(400).json({ error: 'Download type must be video or audio' });
    }

    res.json(incrementDownloadCount(type));
  } catch (error) {
    console.error('Stats increment error:', error);
    res.status(500).json({ error: 'Could not update download count' });
  }
});

router.post('/info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    const { url: normalizedUrl, platform } = normalizeMediaURL(url);

    if (!normalizedUrl) {
      return res.status(400).json({
        error: 'Unsupported media URL',
        details: `Supported platforms: ${SUPPORTED_PLATFORM_LABELS}`
      });
    }

    let stdout;
    try {
      ({ stdout } = await execFileAsync(YTDLP_PATH, [
        '-j',
        '--no-warnings',
        '--no-playlist',
        '--socket-timeout',
        '20',
        ...getYtDlpAuthArgs(),
        normalizedUrl
      ], {
        maxBuffer: 80 * 1024 * 1024,
        timeout: INFO_TIMEOUT_MS
      }));
    } catch (error) {
      console.error('yt-dlp error:', error.message);
      if (platform.id === 'youtube') {
        const pipedData = await fetchPipedStreams(normalizedUrl);
        if (pipedData) {
          const relayFormats = mapPipedStreams(pipedData);
          return res.json({
            title: pipedData.title || 'Unknown',
            thumbnail: pipedData.thumbnailUrl || '',
            duration: Number(pipedData.duration) || 0,
            uploader: pipedData.uploader || 'Unknown',
            views: Number(pipedData.views) || 0,
            uploadDate: String(pipedData.uploadDate || '').replace(/-/g, ''),
            description: pipedData.description || '',
            channelName: pipedData.uploader || 'Unknown',
            platform: platform.label,
            capabilities: {
              mp3: false,
              merge: false,
              fps: false,
              audioConversions: { bitrates: [], bitrateFormats: [], losslessFormats: [] }
            },
            formats: relayFormats
          });
        }
      }

      const isTimeout = error.killed || error.signal === 'SIGTERM' || error.code === 'ETIMEDOUT';
      return res.status(400).json({
        error: 'Could not retrieve video information',
        details: isTimeout
          ? 'Timed out fetching media information. Try again, or paste the direct post/video URL without playlist or feed parameters.'
          : getProcessErrorDetails(error, 'Video may be private, age-restricted, or unavailable')
      });
    }

    const videoData = JSON.parse(stdout);

    const formats = (videoData.formats || []).filter(isDownloadableMediaFormat);

    const videoFormats = formats.filter(format => hasVideo(format) && !hasAudio(format));
    const audioFormats = formats.filter(format => hasAudio(format) && !hasVideo(format));
    const progressiveFormats = formats.filter(format => hasVideo(format) && hasAudio(format));

    const response = {
      title: videoData.title || 'Unknown',
      thumbnail: selectBestThumbnail(videoData),
      duration: videoData.duration || 0,
      uploader: videoData.uploader || 'Unknown',
      views: videoData.view_count || 0,
      uploadDate: videoData.upload_date || '',
      description: videoData.description || '',
      channelName: videoData.channel || 'Unknown',
      platform: platform.label,
      capabilities: {
        mp3: Boolean(FFMPEG_PATH),
        merge: Boolean(FFMPEG_PATH),
        fps: Boolean(FFMPEG_PATH),
        audioConversions: getAudioConversionCapabilities()
      },
      formats: {
        video: videoFormats.map(mapVideoFormat).sort((a, b) =>
          b.height - a.height ||
          (Number(b.fps) || 0) - (Number(a.fps) || 0) ||
          a.container.localeCompare(b.container)
        ),
        audio: audioFormats.map(mapAudioFormat).sort((a, b) =>
          b.abr - a.abr ||
          a.container.localeCompare(b.container)
        ),
        progressive: [
          ...createMergedProgressiveFormats(videoFormats, audioFormats),
          ...progressiveFormats.map(mapVideoFormat)
        ].sort((a, b) =>
          b.height - a.height ||
          (Number(b.fps) || 0) - (Number(a.fps) || 0) ||
          a.container.localeCompare(b.container)
        )
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error in /info:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/download', async (req, res) => {
  try {
    const {
      url,
      formatId,
      filename: requestedFilename,
      outputFormat,
      mergeOutputFormat,
      container,
      audioBitrate,
      videoFps
    } = req.body;

    if (!url || typeof url !== 'string' || !formatId || typeof formatId !== 'string') {
      return res.status(400).json({ error: 'URL and format ID required' });
    }

    const { url: normalizedUrl } = normalizeMediaURL(url);

    if (!normalizedUrl) {
      return res.status(400).json({
        error: 'Unsupported media URL',
        details: `Supported platforms: ${SUPPORTED_PLATFORM_LABELS}`
      });
    }

    const relayStreamUrl = decodeRelayStreamUrl(formatId);
    if (relayStreamUrl) {
      if (outputFormat || mergeOutputFormat || videoFps) {
        return res.status(400).json({
          error: 'Conversion unavailable for this anonymous format',
          details: 'Choose one of the directly available formats.'
        });
      }

      const relayExtension = getDownloadExtension({ container });
      await streamRelayDownload({
        streamUrl: relayStreamUrl,
        filename: getResponseFilename(requestedFilename, relayExtension),
        extension: relayExtension,
        res
      });
      return;
    }

    if (!/^[A-Za-z0-9._:@-]+(\+[A-Za-z0-9._:@-]+)?$/.test(formatId)) {
      return res.status(400).json({ error: 'Invalid format ID' });
    }

    const requestedOutputFormat = getAudioOutputFormat(outputFormat);
    const isAudioConversion = Boolean(requestedOutputFormat);

    if (outputFormat && !requestedOutputFormat) {
      return res.status(400).json({ error: 'Unsupported output format' });
    }

    const requestedAudioBitrate = requestedOutputFormat?.usesBitrate
      ? normalizeAudioBitrate(audioBitrate)
      : 0;
    const requestedVideoFPS = normalizeVideoFPS(videoFps);

    if (requestedOutputFormat?.usesBitrate && !requestedAudioBitrate) {
      return res.status(400).json({ error: 'Unsupported audio bitrate' });
    }

    if (videoFps && !requestedVideoFPS) {
      return res.status(400).json({ error: 'Unsupported video FPS' });
    }

    if (isAudioConversion && requestedVideoFPS) {
      return res.status(400).json({ error: 'Choose either audio conversion or video FPS conversion' });
    }

    if (mergeOutputFormat && !['mp4', 'webm', 'mkv'].includes(mergeOutputFormat)) {
      return res.status(400).json({ error: 'Unsupported merge output format' });
    }

    if (mergeOutputFormat && !FFMPEG_PATH) {
      return res.status(400).json({
        error: 'Format merge unavailable',
        details: 'Merging video and audio requires FFmpeg on this system'
      });
    }

    if (isAudioConversion && !isAudioOutputFormatSupported(requestedOutputFormat)) {
      return res.status(400).json({
        error: `${requestedOutputFormat.label} conversion unavailable`,
        details: 'This audio conversion requires a supported FFmpeg encoder on this system'
      });
    }

    if (requestedVideoFPS && !FFMPEG_PATH) {
      return res.status(400).json({
        error: 'FPS conversion unavailable',
        details: 'FPS conversion requires FFmpeg on this system'
      });
    }

    const streamExtension = requestedVideoFPS
      ? 'mp4'
      : getDownloadExtension({ outputFormat: requestedOutputFormat?.id, mergeOutputFormat, container });
    const streamFilename = getResponseFilename(requestedFilename, streamExtension);

    if (canStreamDirectDownload({ formatId, outputFormat: requestedOutputFormat?.id, mergeOutputFormat, videoFps: requestedVideoFPS })) {
      await streamYtDlpDownload({
        normalizedUrl,
        formatId,
        filename: streamFilename,
        extension: streamExtension,
        res
      });
      return;
    }

    if (canStreamMergedDownload({ formatId, outputFormat: requestedOutputFormat?.id, mergeOutputFormat, videoFps: requestedVideoFPS })) {
      await streamYtDlpDownload({
        normalizedUrl,
        formatId,
        filename: streamFilename,
        extension: streamExtension,
        res,
        mergeOutputFormat
      });
      return;
    }

    if (isAudioConversion || requestedVideoFPS) {
      await streamConvertedDownload({
        normalizedUrl,
        formatId,
        filename: streamFilename,
        extension: streamExtension,
        res,
        outputFormat: requestedOutputFormat?.id || '',
        audioBitrate: requestedAudioBitrate,
        videoFps: requestedVideoFPS,
        mergeOutputFormat
      });
      return;
    }

    const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const filePrefix = path.join(TEMP_DIR, filename);
    const outputTemplate = `${filePrefix}.%(ext)s`;
    const cleanupPaths = new Set();

    let downloadedPath;
    try {
      const ytDlpArgs = [
        '-f',
        formatId,
        '-o',
        outputTemplate,
        '--no-warnings',
        '--no-progress',
        '--no-playlist',
        '--socket-timeout',
        '20',
        '--concurrent-fragments',
        '4'
      ];

      if (mergeOutputFormat) {
        ytDlpArgs.push('--merge-output-format', mergeOutputFormat);
      }

      ytDlpArgs.push(...getYtDlpAuthArgs());

      ytDlpArgs.push(
        '--print',
        'after_move:filepath',
        normalizedUrl
      );

      const { stdout } = await execFileAsync(YTDLP_PATH, ytDlpArgs, {
        maxBuffer: 50 * 1024 * 1024,
        timeout: DOWNLOAD_TIMEOUT_MS
      });

      downloadedPath = stdout.trim().split(/\r?\n/).filter(Boolean).pop();
    } catch (error) {
      console.error('Download error:', error.message);
      return res.status(400).json({
        error: 'Download failed',
        details: getProcessErrorDetails(error, 'Unable to download this format')
      });
    }

    if (downloadedPath && isInsideTempDir(downloadedPath)) {
      downloadedPath = path.resolve(downloadedPath);
    } else {
      downloadedPath = null;
    }

    if (!downloadedPath || !fs.existsSync(downloadedPath)) {
      downloadedPath = findDownloadedFile(filePrefix);
    }

    if (!downloadedPath || !fs.existsSync(downloadedPath)) {
      return res.status(500).json({ error: 'Downloaded file was not created' });
    }

    cleanupPaths.add(downloadedPath);

    if (outputFormat === 'mp3') {
      const convertedPath = `${filePrefix}.mp3`;
      try {
        await execFileAsync(FFMPEG_PATH, [
          '-y',
          '-i',
          downloadedPath,
          '-vn',
          '-codec:a',
          'libmp3lame',
          '-b:a',
          `${requestedAudioBitrate}k`,
          convertedPath
      ], {
        maxBuffer: 10 * 1024 * 1024,
        timeout: DOWNLOAD_TIMEOUT_MS
      });
      } catch (error) {
        console.error('MP3 conversion error:', error.message);
        cleanupPaths.forEach(filePath => {
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {
            console.error('Cleanup error:', e);
          }
        });
        return res.status(400).json({
          error: 'MP3 conversion failed',
          details: getProcessErrorDetails(error, 'Unable to convert this audio stream to MP3')
        });
      }

      if (!fs.existsSync(convertedPath)) {
        cleanupPaths.forEach(filePath => {
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {
            console.error('Cleanup error:', e);
          }
        });
        return res.status(500).json({ error: 'Converted MP3 file was not created' });
      }

      downloadedPath = convertedPath;
      cleanupPaths.add(downloadedPath);
    }

    if (requestedVideoFPS) {
      const convertedPath = `${filePrefix}_${String(requestedVideoFPS).replace('.', '_')}fps.mp4`;
      try {
        await execFileAsync(FFMPEG_PATH, [
          '-y',
          '-i',
          downloadedPath,
          '-map',
          '0:v:0',
          '-map',
          '0:a?',
          '-vf',
          `fps=${getVideoFPSFilterValue(requestedVideoFPS)}`,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '20',
          '-c:a',
          'aac',
          '-b:a',
          '192k',
          '-movflags',
          '+faststart',
          convertedPath
      ], {
        maxBuffer: 20 * 1024 * 1024,
        timeout: DOWNLOAD_TIMEOUT_MS
      });
      } catch (error) {
        console.error('FPS conversion error:', error.message);
        cleanupPaths.forEach(filePath => {
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {
            console.error('Cleanup error:', e);
          }
        });
        return res.status(400).json({
          error: 'FPS conversion failed',
          details: getProcessErrorDetails(error, 'Unable to convert this video to the selected FPS')
        });
      }

      if (!fs.existsSync(convertedPath)) {
        cleanupPaths.forEach(filePath => {
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {
            console.error('Cleanup error:', e);
          }
        });
        return res.status(500).json({ error: 'Converted video file was not created' });
      }

      downloadedPath = convertedPath;
      cleanupPaths.add(downloadedPath);
    }

    const extension = path.extname(downloadedPath) || '.mp4';
    const filenameBase = sanitizeDownloadName(requestedFilename || path.basename(downloadedPath, extension))
      .replace(new RegExp(`${extension.replace('.', '\\.')}$`, 'i'), '');

    res.download(downloadedPath, `${filenameBase}${extension}`, (err) => {
      if (err) console.error('Download error:', err);
      cleanupPaths.forEach(filePath => {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.error('Cleanup error:', e);
        }
      });
    });
  } catch (error) {
    console.error('Error in /download:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
