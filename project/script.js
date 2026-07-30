// State Management
const state = {
  currentVideo: null,
  currentUrl: '',
  isLoading: false,
  downloadingFormats: new Set(),
  currentTab: 'progressive',
  downloadCount: 0,
  isHistoryExpanded: false
};

// DOM Elements
const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const getVideoBtn = document.getElementById('getVideoBtn');
const urlError = document.getElementById('urlError');
const heroSection = document.querySelector('.hero');
const loadingSection = document.getElementById('loadingSection');
const videoDetailsSection = document.getElementById('videoDetails');
const backBtn = document.getElementById('backBtn');
const dropZone = document.getElementById('dropZone');
const toastContainer = document.getElementById('toastContainer');
const suggestionsList = document.getElementById('suggestionsList');
const suggestionsHeading = document.querySelector('.suggestions-heading');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const toggleDescBtn = document.getElementById('toggleDesc');
const descriptionElement = document.getElementById('description');
const samePageLinks = document.querySelectorAll('a[href^="#"]');
const downloadCountElement = document.getElementById('downloadCount');
const downlyStatElement = document.querySelector('.downly-stat');
const copyrightYearElement = document.getElementById('copyrightYear');
const supportPopup = document.getElementById('supportPopup');
const supportPopupCloseBtn = document.getElementById('supportPopupClose');
const supportPopupLaterBtn = document.getElementById('supportPopupLater');

let supportPopupPreviousFocus = null;

// Constants
const LEGACY_HISTORY_KEY = 'yt-downloader-history';
const HISTORY_KEY = 'downly-history';
const API_BASE = '/api';
const MAX_HISTORY = 9;
const VISIBLE_HISTORY_COUNT = 3;
const VIDEO_INFO_TIMEOUT_MS = 95000;
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

// Utility Functions
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!seconds) return 'Unknown';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return 'Unknown';
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${day}/${month}/${year}`;
}

function formatViews(views) {
  if (!views) return '0';
  if (views >= 1e9) return (views / 1e9).toFixed(1) + 'B';
  if (views >= 1e6) return (views / 1e6).toFixed(1) + 'M';
  if (views >= 1e3) return (views / 1e3).toFixed(1) + 'K';
  return views.toString();
}

function formatCount(count) {
  return new Intl.NumberFormat('en-US').format(Number(count) || 0);
}

function sanitizeDownloadPart(value, fallback = '') {
  const sanitized = String(value || fallback)
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);

  return sanitized;
}

function buildDownloadFilename(type, format) {
  const title = sanitizeDownloadPart(state.currentVideo?.title, 'downloaded_media');
  const kind = type === 'progressive' ? 'video_audio' : `${type}_only`;
  const quality = sanitizeDownloadPart(type === 'audio' ? format.bitrate : format.quality);
  const resolution = type === 'audio' ? '' : sanitizeDownloadPart(format.resolution);
  const extension = sanitizeDownloadPart(format.container);
  const formatId = sanitizeDownloadPart(format.id);

  return [title, kind, quality, resolution, extension, formatId]
    .filter(part => part && part !== 'Unknown')
    .join('_') || 'download';
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getDownloadKey(format) {
  return `${format.id}:${format.outputFormat || format.mergeOutputFormat || format.container || 'source'}`;
}

function getFormatSize(format) {
  return Number(format.filesize) || 0;
}

function getAudioBitrate(format) {
  if (typeof format.abr === 'number') return format.abr;
  const match = String(format.bitrate || '').match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

function getContainer(format) {
  return String(format.outputFormat || format.container || 'unknown').toLowerCase();
}

function getHDRLabel(format) {
  const hdrValue = String(format.hdr || '').trim();
  if (!hdrValue || ['No', 'SDR', 'Unknown'].includes(hdrValue)) return '';
  return hdrValue.toUpperCase().includes('HDR') ? hdrValue.toUpperCase() : `HDR ${hdrValue.toUpperCase()}`;
}

function selectPreferredFormat(current, candidate, type) {
  if (!current) return candidate;

  const currentSize = getFormatSize(current);
  const candidateSize = getFormatSize(candidate);
  if (candidateSize !== currentSize) {
    return candidateSize > currentSize ? candidate : current;
  }

  if (type !== 'audio') {
    const codecRank = { avc1: 4, h264: 4, vp9: 3, av01: 2 };
    const currentRank = codecRank[String(current.codec || '').toLowerCase()] || 1;
    const candidateRank = codecRank[String(candidate.codec || '').toLowerCase()] || 1;
    if (candidateRank !== currentRank) return candidateRank > currentRank ? candidate : current;
  }

  return current;
}

function sortFormatsForDisplay(formats, type) {
  return [...formats].sort((a, b) => {
    if (type === 'audio') return getAudioBitrate(b) - getAudioBitrate(a);
    return (Number(b.height) || 0) - (Number(a.height) || 0);
  });
}

function addChoice(group, format, type) {
  const container = getContainer(format);
  const existingIndex = group.choices.findIndex(choice => getContainer(choice) === container);
  if (existingIndex === -1) {
    group.choices.push(format);
    return;
  }

  group.choices[existingIndex] = selectPreferredFormat(group.choices[existingIndex], format, type);
}

function addGroupBadges(groups) {
  if (groups.length === 0) return groups;
  if (groups.length === 1) {
    groups[0].badges = [...groups[0].badges, 'Best available'];
    return groups;
  }

  groups[0].badges = [...groups[0].badges, 'Best quality'];
  groups[groups.length - 1].badges = [...groups[groups.length - 1].badges, 'Lowest quality'];
  return groups;
}

function createVideoGroups(type, formats) {
  const groups = [];
  const groupMap = new Map();

  sortFormatsForDisplay(formats, type).forEach(format => {
    const hdrLabel = getHDRLabel(format);
    const key = `${format.height || format.quality}:${format.resolution}:${hdrLabel || 'sdr'}`;
    if (!groupMap.has(key)) {
      const group = {
        id: key,
        title: format.quality || 'Unknown',
        subtitle: format.resolution && format.resolution !== 'Unknown'
          ? `${format.resolution} · ${format.fps || 'Unknown'} fps`
          : `${format.fps || 'Unknown'} fps`,
        details: type === 'progressive' ? 'Video + audio' : 'Video only',
        sortValue: Number(format.height) || 0,
        badges: hdrLabel ? [hdrLabel] : [],
        choices: []
      };
      groupMap.set(key, group);
      groups.push(group);
    }

    addChoice(groupMap.get(key), format, type);
  });

  groups.sort((a, b) => b.sortValue - a.sortValue);
  return addGroupBadges(groups);
}

function getAudioTier(format, maxBitrate) {
  const bitrate = getAudioBitrate(format);
  if (!maxBitrate || bitrate >= maxBitrate * 0.72) return 'best';
  return 'small';
}

function createAudioGroups(formats) {
  const sortedFormats = sortFormatsForDisplay(formats, 'audio');
  const maxBitrate = Math.max(...sortedFormats.map(getAudioBitrate), 0);
  const groups = [];
  const groupMap = new Map();

  sortedFormats.forEach(format => {
    const tier = getAudioTier(format, maxBitrate);
    if (!groupMap.has(tier)) {
      const group = {
        id: tier,
        title: tier === 'best' ? 'Best audio' : 'Smallest file',
        subtitle: tier === 'best' ? 'Higher bitrate' : 'Lower bitrate',
        details: 'Audio only',
        sortValue: tier === 'best' ? 2 : 1,
        badges: [],
        choices: []
      };
      groupMap.set(tier, group);
      groups.push(group);
    }

    addChoice(groupMap.get(tier), format, 'audio');
  });

  groups.forEach(group => {
    const m4aChoice = group.choices.find(choice => getContainer(choice) === 'm4a');
    const hasMp3 = group.choices.some(choice => getContainer(choice) === 'mp3');
    if (state.currentVideo?.capabilities?.mp3 && m4aChoice && !hasMp3) {
      group.choices.push({
        ...m4aChoice,
        container: 'mp3',
        codec: 'mp3',
        outputFormat: 'mp3',
        filesize: null,
        converted: true
      });
    }
  });

  groups.sort((a, b) => b.sortValue - a.sortValue);
  return addGroupBadges(groups);
}

function createFormatGroups(type, formats) {
  if (type === 'audio') return createAudioGroups(formats);
  return createVideoGroups(type, formats);
}

// Toast Notifications
function showToast(message, type = 'info', duration = 4000) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ'
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close notification">×</button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => {
    toast.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => toast.remove(), 300);
  });

  toastContainer.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = 'slideIn 0.3s ease-out reverse';
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  return toast;
}

function showSupportPopup() {
  if (!supportPopup || !supportPopup.hidden) return;

  supportPopupPreviousFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  supportPopup.hidden = false;
  document.body.classList.add('support-popup-open');

  requestAnimationFrame(() => {
    supportPopupCloseBtn?.focus();
  });
}

function hideSupportPopup() {
  if (!supportPopup || supportPopup.hidden) return;

  supportPopup.hidden = true;
  document.body.classList.remove('support-popup-open');

  if (supportPopupPreviousFocus) {
    supportPopupPreviousFocus.focus();
    supportPopupPreviousFocus = null;
  }
}

// History Management
function migrateLegacyHistory() {
  try {
    if (localStorage.getItem(HISTORY_KEY) || !localStorage.getItem(LEGACY_HISTORY_KEY)) return;
    localStorage.setItem(HISTORY_KEY, localStorage.getItem(LEGACY_HISTORY_KEY));
  } catch (error) {
    console.error('History migration error:', error);
  }
}

function loadHistory() {
  try {
    const parsedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if (!Array.isArray(parsedHistory)) return [];

    const history = [...new Set(parsedHistory
      .filter(url => typeof url === 'string' && url.trim()))]
      .slice(0, MAX_HISTORY);

    if (history.length !== parsedHistory.length || history.some((url, index) => url !== parsedHistory[index])) {
      persistHistory(history);
    }

    return history;
  } catch (error) {
    console.error('History load error:', error);
    return [];
  }
}

function persistHistory(history) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
  } catch (error) {
    console.error('History save error:', error);
  }
}

function saveToHistory(url) {
  const history = loadHistory();
  const filtered = history.filter(u => u !== url);
  filtered.unshift(url);
  state.isHistoryExpanded = false;
  persistHistory(filtered);
  updateSuggestions();
}

function clearHistory() {
  if (!loadHistory().length) return;

  const confirmed = window.confirm('Clear all recent links saved on this device?');
  if (!confirmed) return;

  state.isHistoryExpanded = false;

  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch (error) {
    console.error('History clear error:', error);
  }

  updateSuggestions();
  showToast('Recent links cleared', 'success');
}

function createSuggestionButton(url) {
  const btn = document.createElement('button');
  btn.className = 'suggestion-btn';
  btn.type = 'button';
  btn.textContent = url;
  btn.title = url;
  btn.addEventListener('click', () => {
    urlInput.value = url;
    urlInput.focus();
  });
  return btn;
}

function closeHistoryMenu() {
  if (!state.isHistoryExpanded) return;
  state.isHistoryExpanded = false;
  updateSuggestions();
}

function updateSuggestions() {
  suggestionsHeading?.querySelector('.history-more')?.remove();
  const history = loadHistory();
  suggestionsList.innerHTML = '';
  clearHistoryBtn.hidden = history.length === 0;

  if (history.length <= VISIBLE_HISTORY_COUNT) {
    state.isHistoryExpanded = false;
  }

  if (history.length === 0) {
    suggestionsList.innerHTML = '<span class="text-tertiary">No history yet</span>';
    return;
  }

  const visibleHistory = history.slice(0, VISIBLE_HISTORY_COUNT);
  const hiddenHistory = history.slice(VISIBLE_HISTORY_COUNT);

  const actionsWrapper = document.createElement('div');
  actionsWrapper.className = 'history-actions';

  visibleHistory.forEach(url => {
    suggestionsList.appendChild(createSuggestionButton(url));
  });

  const moreWrapper = document.createElement('div');
  moreWrapper.className = 'history-more';

  const menuId = 'recentLinksMoreMenu';

  const menu = document.createElement('div');
  menu.className = 'history-more-menu';
  menu.id = menuId;
  menu.hidden = !state.isHistoryExpanded;
  menu.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  hiddenHistory.forEach(url => {
    menu.appendChild(createSuggestionButton(url));
  });

  if (hiddenHistory.length > 0) {
    const moreBtn = document.createElement('button');
    moreBtn.className = 'history-toggle-btn';
    moreBtn.type = 'button';
    moreBtn.textContent = `More (${hiddenHistory.length})`;
    moreBtn.setAttribute('aria-expanded', String(state.isHistoryExpanded));
    moreBtn.setAttribute('aria-controls', menuId);
    moreBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      state.isHistoryExpanded = !state.isHistoryExpanded;
      updateSuggestions();
    });
    actionsWrapper.append(moreBtn);
  }

  actionsWrapper.append(clearHistoryBtn);
  moreWrapper.append(actionsWrapper, menu);
  suggestionsHeading?.appendChild(moreWrapper);
}

// Clipboard Operations
pasteBtn.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text;
    urlInput.focus();
  } catch (err) {
    showToast('Could not access clipboard', 'error');
  }
});

// URL Validation
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
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) return '';

    const platform = getSupportedPlatform(parsedUrl);
    if (!platform) return '';

    if (platform.id === 'youtube') return normalizeYouTubeURL(url);

    parsedUrl.hash = '';
    return parsedUrl.href;
  } catch (error) {
    return '';
  }
}

function validateURL(url) {
  return Boolean(normalizeMediaURL(url));
}

function displayError(message) {
  urlError.textContent = message;
  urlError.style.display = 'block';
}

function clearError() {
  urlError.style.display = 'none';
}

function renderDownloadCount(count) {
  state.downloadCount = Number(count) || 0;
  downlyStatElement?.classList.remove('is-unavailable');
  if (downloadCountElement) {
    downloadCountElement.textContent = formatCount(state.downloadCount);
  }
}

function markDownloadCountUnavailable() {
  downlyStatElement?.classList.add('is-unavailable');
  if (downloadCountElement) {
    downloadCountElement.textContent = '—';
  }
}

function renderCopyrightYear() {
  if (copyrightYearElement) {
    copyrightYearElement.textContent = String(new Date().getFullYear());
  }
}

// API Calls
async function fetchDownloadStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) throw new Error('Stats unavailable');

    const stats = await response.json();
    renderDownloadCount(stats.downloadCount);
  } catch (error) {
    console.error('Stats fetch error:', error);
    markDownloadCountUnavailable();
  }
}

async function incrementDownloadCount(url) {
  try {
    const response = await fetch(`${API_BASE}/stats/increment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });

    if (!response.ok) throw new Error('Stats update failed');

    const stats = await response.json();
    renderDownloadCount(stats.downloadCount);
  } catch (error) {
    console.error('Stats update error:', error);
    markDownloadCountUnavailable();
  }
}

async function fetchVideoInfo(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VIDEO_INFO_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error('API Error:', error);
      throw new Error(error.details || error.error || 'Failed to fetch video info');
    }

    const data = await response.json();
    console.log('Video Data:', data);
    console.log('Formats - Progressive:', data.formats.progressive.length);
    console.log('Formats - Video:', data.formats.video.length);
    console.log('Formats - Audio:', data.formats.audio.length);
    return data;
  } catch (error) {
    console.error('Fetch error:', error);
    if (error.name === 'AbortError') {
      throw new Error('Timed out fetching video information. Try again, or paste the single-video watch URL without playlist/radio parameters.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getDownloadFrame() {
  const frameName = 'downlyDownloadFrame';
  let frame = document.querySelector(`iframe[name="${frameName}"]`);

  if (!frame) {
    frame = document.createElement('iframe');
    frame.name = frameName;
    frame.style.display = 'none';
    frame.setAttribute('aria-hidden', 'true');
    document.body.appendChild(frame);
  }

  return frame;
}

function submitDownloadForm(fields) {
  const frame = getDownloadFrame();
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = `${API_BASE}/download`;
  form.target = frame.name;
  form.style.display = 'none';

  Object.entries(fields).forEach(([name, value]) => {
    if (value === undefined || value === null || value === '') return;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  window.setTimeout(() => form.remove(), 1000);
}

async function downloadFormat(url, format, filename) {
  submitDownloadForm({
    url,
    formatId: format.id,
    filename,
    container: format.container,
    outputFormat: format.outputFormat,
    mergeOutputFormat: format.mergeOutputFormat
  });

  await new Promise(resolve => window.setTimeout(resolve, 350));
}

// UI Rendering
function showSection(section) {
  heroSection.style.display = section === 'hero' ? 'flex' : 'none';
  loadingSection.style.display = section === 'loading' ? 'flex' : 'none';
  videoDetailsSection.style.display = section === 'details' ? 'block' : 'none';
}

function scrollToElement(element) {
  requestAnimationFrame(() => {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  });
}

function navigateToHash(hash) {
  const targetHash = hash || '#downloader';
  const target = document.querySelector(targetHash);

  if (!target) return;

  if (targetHash === '#downloader' || targetHash === '#creatorSpotlight' || targetHash === '#support') {
    showSection('hero');
  }

  if (window.location.hash !== targetHash) {
    window.history.pushState(null, '', targetHash);
  }

  scrollToElement(target);

  if (targetHash === '#downloader') {
    urlInput.focus({ preventScroll: true });
  }
}

function activateTab(tabName) {
  document.querySelectorAll('.tab-button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  document.querySelectorAll('.tab-content').forEach(content => {
    const isActive = content.id === tabName;
    content.classList.toggle('active', isActive);
    content.style.display = isActive ? 'block' : 'none';
  });

  state.currentTab = tabName;
}

function renderVideoDetails(data) {
  state.currentVideo = data;
  const platformClass = `platform-${String(data.platform || 'media')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')}`;

  videoDetailsSection.className = `video-details ${platformClass}`;
  document.getElementById('thumbnail').src = data.thumbnail;
  document.getElementById('videoTitle').textContent = data.title;
  document.getElementById('uploader').textContent = data.uploader;
  document.getElementById('duration').textContent = formatDuration(data.duration);
  document.getElementById('views').textContent = formatViews(data.views);
  document.getElementById('uploadDate').textContent = formatDate(data.uploadDate);
  document.getElementById('description').textContent = data.description;

  // Render tables
  renderFormatTable('progressive', data.formats.progressive);
  renderFormatTable('video', data.formats.video);
  renderFormatTable('audio', data.formats.audio);
  activateTab('progressive');
}

function renderFormatTable(type, formats) {
  const formatList = document.getElementById(`${type}Table`);
  const emptyState = document.getElementById(`${type}Empty`);

  formatList.innerHTML = '';

  if (!formats || formats.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  const groups = createFormatGroups(type, formats);
  if (groups.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  groups.forEach((group, index) => {
    const row = document.createElement('div');
    const optionBadge = group.choices.length > 1
      ? `<span class="format-count">${group.choices.length} options</span>`
      : '';
    row.className = 'format-row';
    row.style.animationDelay = `${index * 0.04}s`;
    row.innerHTML = `
      <div class="format-quality">
        <div class="quality-title-row">
          <span class="quality-title">${escapeHTML(group.title)}</span>
          <span class="quality-badges">
            ${group.badges.map(badge => {
              const badgeClass = badge.includes('Lowest') ? 'is-low' : badge.includes('Best') ? 'is-best' : badge.includes('HDR') ? 'is-hdr' : 'is-neutral';
              return `<span class="quality-badge ${badgeClass}">${escapeHTML(badge)}</span>`;
            }).join('')}
          </span>
        </div>
        <span class="quality-subtitle">${escapeHTML(group.subtitle)}</span>
      </div>
      <div class="format-context">
        <span class="format-kind">${escapeHTML(group.details)}</span>
        ${optionBadge}
      </div>
      <div class="format-actions" aria-label="Download choices"></div>
    `;

    const actions = row.querySelector('.format-actions');
    group.choices
      .sort((a, b) => {
        const order = { mp4: 1, m4a: 1, mp3: 2, webm: 3 };
        return (order[getContainer(a)] || 9) - (order[getContainer(b)] || 9);
      })
      .forEach(format => {
        const containerLabel = sanitizeDownloadPart(format.container).toUpperCase();
        const rawSizeLabel = format.converted ? 'converted' : formatFileSize(format.filesize);
        const sizeLabel = rawSizeLabel === 'Unknown' ? '' : rawSizeLabel;
        const rawCodecLabel = sanitizeDownloadPart(format.codec, '');
        const codecLabel = rawCodecLabel && rawCodecLabel !== 'Unknown'
          ? rawCodecLabel
          : type === 'audio' ? 'audio' : 'video';
        const rawAudioCodecLabel = sanitizeDownloadPart(format.audioCodec, '');
        const audioCodecLabel = rawAudioCodecLabel && rawAudioCodecLabel !== 'Unknown'
          ? rawAudioCodecLabel
          : 'audio';
        const hdrLabel = getHDRLabel(format);
        const metaLabel = format.merged
          ? `${codecLabel} + ${audioCodecLabel}`
          : codecLabel;
        const detailLabel = [metaLabel, hdrLabel, sizeLabel].filter(Boolean).join(' · ');
        const titleLabel = [metaLabel, hdrLabel, rawSizeLabel].filter(Boolean).join(' · ');
        const button = document.createElement('button');
        button.className = 'download-btn';
        button.dataset.formatId = format.id;
        button.type = 'button';
        button.title = `${containerLabel} · ${titleLabel}`;
        button.innerHTML = `
          <span class="download-icon" aria-hidden="true">↓</span>
          <span class="download-label">${escapeHTML(containerLabel || 'FILE')}</span>
          <span class="download-meta">${escapeHTML(detailLabel)}</span>
        `;
        button.addEventListener('click', () => handleDownload(button, format, type));
        actions.appendChild(button);
      });

    formatList.appendChild(row);
  });
}

// Event Handlers
async function handleGetVideo() {
  if (state.isLoading) return;

  const url = urlInput.value.trim();
  const normalizedUrl = normalizeMediaURL(url);

  clearError();

  if (!url) {
    displayError('Please enter a video or audio URL');
    return;
  }

  if (!normalizedUrl) {
    displayError(`Unsupported URL. Try: ${SUPPORTED_PLATFORM_LABELS}`);
    return;
  }

  state.isLoading = true;
  getVideoBtn.disabled = true;
  urlInput.disabled = true;
  showSection('loading');
  incrementDownloadCount(normalizedUrl);

  try {
    const data = await fetchVideoInfo(normalizedUrl);
    state.currentUrl = normalizedUrl;
    data.sourceUrl = normalizedUrl;
    urlInput.value = normalizedUrl;
    saveToHistory(normalizedUrl);
    clearError();
    renderVideoDetails(data);
    showSection('details');
    showToast('Video loaded successfully!', 'success');
  } catch (error) {
    showSection('hero');
    clearError();
    displayError(error.message || 'Failed to fetch video information');
    showToast(error.message || 'Error loading video', 'error');
  } finally {
    state.isLoading = false;
    getVideoBtn.disabled = false;
    urlInput.disabled = false;
  }
}

async function handleDownload(btn, format, type) {
  const formatId = getDownloadKey(format);

  if (state.downloadingFormats.has(formatId)) return;

  const downloadUrl = state.currentVideo?.sourceUrl || state.currentUrl || urlInput.value.trim();
  if (!downloadUrl || !validateURL(downloadUrl)) {
    showToast('Original media URL is missing. Please load it again.', 'error');
    return;
  }

  state.downloadingFormats.add(formatId);
  btn.disabled = true;
  btn.classList.add('loading');

  try {
    await downloadFormat(normalizeMediaURL(downloadUrl), format, buildDownloadFilename(type, format));
    showToast('Download is starting...', 'success');
    showSupportPopup();
  } catch (error) {
    showToast(error.message || 'Download failed', 'error');
  } finally {
    state.downloadingFormats.delete(formatId);
    btn.disabled = false;
    btn.classList.remove('loading');
  }
}

function handleBack() {
  navigateToHash('#downloader');
}

function handleCurrentHash() {
  const appHashes = ['#downloader', '#creatorSpotlight', '#support'];
  if (appHashes.includes(window.location.hash)) {
    navigateToHash(window.location.hash);
  }
}

// Tab Navigation
document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => {
    activateTab(btn.dataset.tab);
  });
});

// Description Toggle
toggleDescBtn.addEventListener('click', () => {
  const isVisible = descriptionElement.style.display !== 'none';
  if (isVisible) {
    descriptionElement.style.display = 'none';
    toggleDescBtn.textContent = 'Show Description';
  } else {
    descriptionElement.style.display = 'block';
    toggleDescBtn.textContent = 'Hide Description';
  }
});

// Drag and Drop
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.style.display = 'flex';
});

dropZone.addEventListener('dragleave', () => {
  dropZone.style.display = 'none';
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.style.display = 'none';

  const text = e.dataTransfer.getData('text/plain');
  const normalizedUrl = normalizeMediaURL(text);
  if (normalizedUrl) {
    urlInput.value = normalizedUrl;
    handleGetVideo();
  } else {
    displayError(`Unsupported URL dropped. Try: ${SUPPORTED_PLATFORM_LABELS}`);
  }
});

// Keyboard Shortcuts
urlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    handleGetVideo();
  }
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    urlInput.value = '';
    clearError();
  }
});

// Event Listeners
getVideoBtn.addEventListener('click', handleGetVideo);
backBtn.addEventListener('click', handleBack);
clearHistoryBtn.addEventListener('click', clearHistory);
supportPopupCloseBtn?.addEventListener('click', hideSupportPopup);
supportPopupLaterBtn?.addEventListener('click', hideSupportPopup);
supportPopup?.addEventListener('click', (event) => {
  const target = event.target;
  if (target === supportPopup || (target instanceof Element && target.closest('.support-popup-btn'))) {
    hideSupportPopup();
  }
});
samePageLinks.forEach(link => {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    navigateToHash(link.getAttribute('href'));
  });
});
window.addEventListener('hashchange', handleCurrentHash);
window.addEventListener('popstate', handleCurrentHash);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && supportPopup && !supportPopup.hidden) {
    hideSupportPopup();
    return;
  }

  if (event.key === 'Escape') {
    closeHistoryMenu();
  }
});
document.addEventListener('click', (event) => {
  const target = event.target;
  if (
    state.isHistoryExpanded &&
    target instanceof Element &&
    !target.closest('.history-more')
  ) {
    closeHistoryMenu();
  }
});

// Initialize
migrateLegacyHistory();
updateSuggestions();
fetchDownloadStats();
renderCopyrightYear();
handleCurrentHash();
