import express from 'express';
import { execFile, spawn } from 'child_process';
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

const YTDLP_COOKIES_PATH = getYtDlpCookiesPath();

const INFO_TIMEOUT_MS = 90000;
const DOWNLOAD_TIMEOUT_MS = 30 * 60 * 1000;
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
    updatedAt: null
  };
}

function normalizeStats(stats) {
  const count = Number(stats?.downloadCount);
  return {
    downloadCount: Number.isSafeInteger(count) && count >= 0 ? count : 0,
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

function incrementDownloadCount() {
  const stats = readStats();
  return writeStats({
    downloadCount: stats.downloadCount + 1,
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

function getDownloadExtension({ outputFormat, mergeOutputFormat, container }) {
  return normalizeDownloadExtension(outputFormat) ||
    normalizeDownloadExtension(mergeOutputFormat) ||
    normalizeDownloadExtension(container) ||
    'mp4';
}

function getDownloadMimeType(extension) {
  const mimeTypes = {
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
}

function getProcessErrorDetails(error, fallback) {
  if (error?.code === 'ENOENT') {
    return `yt-dlp executable not found. Expected "${YTDLP_PATH}". On Vercel, make sure the build installs vendor/yt-dlp and includes it in the function bundle.`;
  }

  const output = [error.stderr, error.stdout]
    .filter(Boolean)
    .join('\n');
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

function getYtDlpCookiesPath() {
  const configuredPath = String(process.env.YTDLP_COOKIES_PATH || '').trim();
  if (configuredPath) return configuredPath;

  const encodedCookies = String(process.env.YTDLP_COOKIES_BASE64 || '').trim();
  if (!encodedCookies) return '';

  try {
    const cookies = Buffer.from(encodedCookies, 'base64').toString('utf8');
    const cookiesPath = path.join(DATA_DIR, 'youtube-cookies.txt');

    if (!/^# (HTTP|Netscape HTTP) Cookie File/m.test(cookies)) {
      console.warn('YTDLP_COOKIES_BASE64 does not look like a Netscape cookies.txt file.');
    }

    fs.writeFileSync(cookiesPath, cookies, { mode: 0o600 });
    return cookiesPath;
  } catch (error) {
    console.error('Could not write yt-dlp cookies file:', error.message);
    return '';
  }
}

function getYtDlpAuthArgs() {
  const args = [];

  if (YTDLP_COOKIES_PATH) {
    args.push('--cookies', YTDLP_COOKIES_PATH);
  }

  if (YTDLP_USER_AGENT) {
    args.push('--user-agent', YTDLP_USER_AGENT);
  }

  return args;
}

function canStreamDirectDownload({ formatId, outputFormat, mergeOutputFormat }) {
  return Boolean(formatId && !formatId.includes('+') && !outputFormat && !mergeOutputFormat);
}

function streamYtDlpDownload({ normalizedUrl, formatId, filename, extension, res }) {
  return new Promise(resolve => {
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
      '--concurrent-fragments',
      '4',
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
  return {
    id: format.format_id,
    quality: extractQuality(format),
    resolution: format.height && format.width ? `${format.width}x${format.height}` : (format.resolution || 'Unknown'),
    fps: format.fps || 'Unknown',
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

router.post('/stats/increment', (req, res) => {
  try {
    const { url } = req.body || {};

    if (!url || typeof url !== 'string' || !validateURL(url)) {
      return res.status(400).json({ error: 'Valid media URL is required' });
    }

    res.json(incrementDownloadCount());
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
        merge: Boolean(FFMPEG_PATH)
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
    const { url, formatId, filename: requestedFilename, outputFormat, mergeOutputFormat, container } = req.body;

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

    if (!/^[A-Za-z0-9._:@-]+(\+[A-Za-z0-9._:@-]+)?$/.test(formatId)) {
      return res.status(400).json({ error: 'Invalid format ID' });
    }

    if (outputFormat && outputFormat !== 'mp3') {
      return res.status(400).json({ error: 'Unsupported output format' });
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

    if (outputFormat === 'mp3' && !FFMPEG_PATH) {
      return res.status(400).json({
        error: 'MP3 conversion unavailable',
        details: 'MP3 conversion requires FFmpeg on this system'
      });
    }

    const streamExtension = getDownloadExtension({ outputFormat, mergeOutputFormat, container });
    const streamFilename = getResponseFilename(requestedFilename, streamExtension);

    if (canStreamDirectDownload({ formatId, outputFormat, mergeOutputFormat })) {
      await streamYtDlpDownload({
        normalizedUrl,
        formatId,
        filename: streamFilename,
        extension: streamExtension,
        res
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
          '192k',
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
