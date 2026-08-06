// State Management
const state = {
  currentVideo: null,
  currentUrl: "",
  isLoading: false,
  downloadingFormats: new Set(),
  currentTab: "progressive",
  downloadStats: {
    totalDownloadCount: 0,
    videoDownloadCount: 0,
    audioDownloadCount: 0,
  },
  isHistoryExpanded: false,
  currentTheme: "standard",
  isThemeSwitching: false,
};

// DOM Elements
const urlInput = document.getElementById("urlInput");
const pasteBtn = document.getElementById("pasteBtn");
const getVideoBtn = document.getElementById("getVideoBtn");
const urlError = document.getElementById("urlError");
const heroSection = document.querySelector(".hero");
const whyChooseSection = document.getElementById("whyChoose");
const howToDownloadSection = document.getElementById("howToDownload");
const loadingSection = document.getElementById("loadingSection");
const videoDetailsSection = document.getElementById("videoDetails");
const backBtn = document.getElementById("backBtn");
const dropZone = document.getElementById("dropZone");
const toastContainer = document.getElementById("toastContainer");
const suggestionsList = document.getElementById("suggestionsList");
const suggestionsHeading = document.querySelector(".suggestions-heading");
const clearHistoryBtn = document.getElementById("clearHistoryBtn");
const toggleDescBtn = document.getElementById("toggleDesc");
const descriptionElement = document.getElementById("description");
const samePageLinks = document.querySelectorAll('a[href^="#"]');
const totalDownloadCountElement = document.getElementById("totalDownloadCount");
const videoDownloadCountElement = document.getElementById("videoDownloadCount");
const audioDownloadCountElement = document.getElementById("audioDownloadCount");
const downlyStatElement = document.querySelector(".downly-stat");
const copyrightYearElement = document.getElementById("copyrightYear");
const supportPopup = document.getElementById("supportPopup");
const supportPopupCloseBtn = document.getElementById("supportPopupClose");
const supportPopupLaterBtn = document.getElementById("supportPopupLater");
const supportPopupStatusElement = document.getElementById("supportPopupStatus");
const supportPopupStatusTextElement = document.getElementById(
  "supportPopupStatusText",
);
const themeToggle = document.getElementById("themeToggle");
const themeTransition = document.getElementById("themeTransition");
const creatorViewCountElement = document.getElementById("creatorViewCount");
const creatorRecentLinkElement = document.getElementById("creatorRecentLink");
const creatorRecentThumbElement = document.getElementById("creatorRecentThumb");
const creatorRecentTitleElement = document.getElementById("creatorRecentTitle");
const popupRecentLinkElement = document.getElementById("popupRecentLink");
const popupRecentThumbElement = document.getElementById("popupRecentThumb");
const popupRecentTitleElement = document.getElementById("popupRecentTitle");
const loadingPromoElement = document.getElementById("loadingPromo");
let loadingPromoTimer = null;

let supportPopupPreviousFocus = null;
let themeTransitionTimers = [];

// Constants
const LEGACY_HISTORY_KEY = "yt-downloader-history";
const HISTORY_KEY = "downly-history";
const THEME_KEY = "downly-ui-theme";
const API_BASE = "/api";
const MAX_HISTORY = 9;
const VISIBLE_HISTORY_COUNT = 3;
const VIDEO_INFO_TIMEOUT_MS = 95000;
const VALID_THEMES = new Set(["standard", "glass"]);
const SUPPORTED_PLATFORMS = [
  {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be", "music.youtube.com"],
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "instagr.am"],
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com", "vm.tiktok.com", "vt.tiktok.com"],
  },
  { id: "x", label: "X / Twitter", hosts: ["x.com", "twitter.com"] },
  { id: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.watch"] },
  { id: "vimeo", label: "Vimeo", hosts: ["vimeo.com"] },
  {
    id: "reddit",
    label: "Reddit",
    hosts: ["reddit.com", "redd.it", "v.redd.it"],
  },
  {
    id: "soundcloud",
    label: "SoundCloud",
    hosts: ["soundcloud.com", "on.soundcloud.com"],
  },
  { id: "twitch", label: "Twitch", hosts: ["twitch.tv", "clips.twitch.tv"] },
  {
    id: "dailymotion",
    label: "Dailymotion",
    hosts: ["dailymotion.com", "dai.ly"],
  },
];
const SUPPORTED_PLATFORM_LABELS = SUPPORTED_PLATFORMS.map(
  (platform) => platform.label,
).join(", ");
const VIDEO_QUALITY_LABELS = {
  720: "720p (HD)",
  1080: "1080p (Full HD)",
  1440: "1440p (2K)",
  2160: "2160p (4K)",
  4320: "4320p (8K)",
};
const AUDIO_CONVERSION_BITRATES = [64, 128, 160, 192, 256, 320];
const AUDIO_BITRATE_MATCH_TOLERANCE = 2;
const AUDIO_OUTPUT_LABELS = {
  mp3: "MP3",
  m4a: "M4A / AAC",
  ogg: "OGG Vorbis",
  opus: "Opus",
  webm: "WEBM Opus",
  flac: "FLAC",
  wav: "WAV",
  alac: "ALAC",
};
const AUDIO_OUTPUT_CODECS = {
  mp3: "mp3",
  m4a: "aac",
  ogg: "vorbis",
  opus: "opus",
  flac: "flac",
  wav: "pcm",
  alac: "alac",
};
const VIDEO_CONVERSION_FPS_VALUES = [30, 59.94, 60];
const FPS_MATCH_TOLERANCE = 0.01;

// Utility Functions
function formatFileSize(bytes) {
  if (!bytes) return "Unknown";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!seconds) return "Unknown";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  return `${minutes}m ${secs}s`;
}

function formatDate(dateStr) {
  if (!dateStr || dateStr.length !== 8) return "Unknown";
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${day}/${month}/${year}`;
}

function formatViews(views) {
  if (!views) return "0";
  if (views >= 1e9) return (views / 1e9).toFixed(1) + "B";
  if (views >= 1e6) return (views / 1e6).toFixed(1) + "M";
  if (views >= 1e3) return (views / 1e3).toFixed(1) + "K";
  return views.toString();
}

function formatCount(count) {
  return new Intl.NumberFormat("en-US").format(Number(count) || 0);
}

function sanitizeDownloadPart(value, fallback = "") {
  const sanitized = String(value || fallback)
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "")
    .slice(0, 80);

  return sanitized;
}

function buildDownloadFilename(type, format) {
  const title = sanitizeDownloadPart(
    state.currentVideo?.title,
    "downloaded_media",
  );
  const kind = type === "progressive" ? "video_audio" : `${type}_only`;
  const quality = sanitizeDownloadPart(
    type === "audio" ? format.bitrate : format.quality,
  );
  const resolution =
    type === "audio" ? "" : sanitizeDownloadPart(format.resolution);
  const fps =
    type === "audio"
      ? ""
      : sanitizeDownloadPart(
          format.videoFps ? `${getVideoFPSLabel(format)}fps` : "",
        );
  const extension = sanitizeDownloadPart(format.container);
  const formatId = sanitizeDownloadPart(format.id);

  return (
    [title, kind, quality, resolution, fps, extension, formatId]
      .filter((part) => part && part !== "Unknown")
      .join("_") || "download"
  );
}

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getDownloadKey(format) {
  return [
    format.id,
    format.outputFormat ||
      format.mergeOutputFormat ||
      format.container ||
      "source",
    format.audioBitrate || "",
    format.videoFps || "",
  ].join(":");
}

function getFormatSize(format) {
  return Number(format.filesize) || 0;
}

function getAudioBitrate(format) {
  if (typeof format.abr === "number") return format.abr;
  const match = String(format.bitrate || "").match(/[\d.]+/);
  return match ? Number(match[0]) : 0;
}

function getCanonicalAudioBitrate(value) {
  const bitrate = Math.round(Number(value) || 0);
  if (!bitrate) return 0;

  const matchingBitrate = AUDIO_CONVERSION_BITRATES.find(
    (target) => Math.abs(target - bitrate) <= AUDIO_BITRATE_MATCH_TOLERANCE,
  );
  return matchingBitrate || bitrate;
}

function getAudioBitrateValue(format) {
  if (format.audioBitrate) return Number(format.audioBitrate) || 0;

  const bitrate = getAudioBitrate(format);
  return Number.isFinite(bitrate) && bitrate > 0 ? Math.round(bitrate) : 0;
}

function getAudioBitrateGroupValue(format) {
  return getCanonicalAudioBitrate(getAudioBitrateValue(format));
}

function getAudioBitrateLabel(format) {
  const bitrate = getAudioBitrateGroupValue(format);
  return bitrate ? `${bitrate} kbps` : "Bitrate unknown";
}

function getContainer(format) {
  return String(
    format.outputFormat || format.container || "unknown",
  ).toLowerCase();
}

function getAudioOutputKey(format) {
  return String(format.outputFormat || format.container || "unknown")
    .trim()
    .toLowerCase();
}

function getAudioOutputLabel(format) {
  const outputKey = getAudioOutputKey(format);
  if (format.outputLabel) return format.outputLabel;
  if (
    outputKey === "webm" &&
    String(format.codec || "").toLowerCase().includes("opus")
  ) {
    return AUDIO_OUTPUT_LABELS.webm;
  }
  return (
    AUDIO_OUTPUT_LABELS[outputKey] ||
    sanitizeDownloadPart(format.container).toUpperCase() ||
    "FILE"
  );
}

function getReadableCodecLabel(format, type) {
  const rawCodec = sanitizeDownloadPart(format.codec, "").toLowerCase();
  if (!rawCodec || rawCodec === "unknown")
    return type === "audio" ? "audio" : "video";
  if (rawCodec === "mp4a" || rawCodec === "m4a") return "aac";
  if (rawCodec === "ogg") return "vorbis";
  if (rawCodec === "wav") return "pcm";
  return rawCodec;
}

function getVideoQualityTitle(format) {
  const height =
    Number(format.height) ||
    Number(String(format.quality || "").match(/\d+/)?.[0]) ||
    0;
  if (height && VIDEO_QUALITY_LABELS[height])
    return VIDEO_QUALITY_LABELS[height];
  return format.quality || "Unknown";
}

function getHDRLabel(format) {
  const hdrValue = String(format.hdr || "").trim();
  if (!hdrValue || ["No", "SDR", "Unknown"].includes(hdrValue)) return "";
  return hdrValue.toUpperCase().includes("HDR")
    ? hdrValue.toUpperCase()
    : `HDR ${hdrValue.toUpperCase()}`;
}

function formatFPSValue(value) {
  const fps = Number(value);
  if (!Number.isFinite(fps) || fps <= 0) return "";
  return Number.isInteger(fps)
    ? String(fps)
    : fps.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function getVideoFPS(format) {
  const fps = Number(format.fps);
  return Number.isFinite(fps) && fps > 0 ? fps : 0;
}

function getVideoFPSLabel(format) {
  const fps = getVideoFPS(format);
  return fps ? formatFPSValue(fps) : "Unknown";
}

function hasMatchingFPS(formats, targetFPS) {
  return formats.some(
    (format) =>
      Math.abs(getVideoFPS(format) - targetFPS) <= FPS_MATCH_TOLERANCE,
  );
}

function selectPreferredFormat(current, candidate, type) {
  if (!current) return candidate;

  if (type !== "audio") {
    const currentFPS = getVideoFPS(current);
    const candidateFPS = getVideoFPS(candidate);
    if (candidateFPS !== currentFPS)
      return candidateFPS > currentFPS ? candidate : current;
  }

  const currentSize = getFormatSize(current);
  const candidateSize = getFormatSize(candidate);
  if (candidateSize !== currentSize) {
    return candidateSize > currentSize ? candidate : current;
  }

  if (type !== "audio") {
    const codecRank = { avc1: 4, h264: 4, vp9: 3, av01: 2 };
    const currentRank =
      codecRank[String(current.codec || "").toLowerCase()] || 1;
    const candidateRank =
      codecRank[String(candidate.codec || "").toLowerCase()] || 1;
    if (candidateRank !== currentRank)
      return candidateRank > currentRank ? candidate : current;
  }

  return current;
}

function sortFormatsForDisplay(formats, type) {
  return [...formats].sort((a, b) => {
    if (type === "audio") return getAudioBitrate(b) - getAudioBitrate(a);
    return (
      (Number(b.height) || 0) - (Number(a.height) || 0) ||
      getVideoFPS(b) - getVideoFPS(a)
    );
  });
}

function addChoice(group, format, type) {
  const container = getContainer(format);
  const existingIndex = group.choices.findIndex(
    (choice) => getContainer(choice) === container,
  );
  if (existingIndex === -1) {
    group.choices.push(format);
    return;
  }

  group.choices[existingIndex] = selectPreferredFormat(
    group.choices[existingIndex],
    format,
    type,
  );
}

function addGroupBadges(groups) {
  if (groups.length === 0) return groups;
  if (groups.length === 1) {
    groups[0].badges = [...groups[0].badges, "Best available"];
    return groups;
  }

  groups[0].badges = [...groups[0].badges, "Best quality"];
  groups[groups.length - 1].badges = [
    ...groups[groups.length - 1].badges,
    "Lowest quality",
  ];
  return groups;
}

function createVideoGroups(type, formats) {
  const groups = [];
  const groupMap = new Map();

  const displayFormats = [
    ...formats,
    ...createConvertedVideoChoices(type, formats),
  ];

  sortFormatsForDisplay(displayFormats, type).forEach((format) => {
    const hdrLabel = getHDRLabel(format);
    const fpsValue = getVideoFPS(format);
    const fpsLabel = getVideoFPSLabel(format);
    const key = `${format.height || format.quality}:${format.resolution}:${fpsLabel}:${hdrLabel || "sdr"}`;
    if (!groupMap.has(key)) {
      const group = {
        id: key,
        title: getVideoQualityTitle(format),
        subtitle:
          format.resolution && format.resolution !== "Unknown"
            ? `${format.resolution} · ${fpsLabel} fps`
            : `${fpsLabel} fps`,
        sortHeight: Number(format.height) || 0,
        sortFPS: fpsValue,
        badges: [hdrLabel, format.videoFps ? "Converted fps" : ""].filter(
          Boolean,
        ),
        choices: [],
      };
      groupMap.set(key, group);
      groups.push(group);
    }

    addChoice(groupMap.get(key), format, type);
  });

  groups.sort((a, b) => b.sortHeight - a.sortHeight || b.sortFPS - a.sortFPS);
  return addGroupBadges(groups);
}

function createConvertedVideoChoices(type, formats) {
  if (!state.currentVideo?.capabilities?.fps || formats.length === 0) return [];

  const sourceMap = new Map();
  sortFormatsForDisplay(formats, type).forEach((format) => {
    const hdrLabel = getHDRLabel(format);
    const key = `${format.height || format.quality}:${format.resolution}:${hdrLabel || "sdr"}`;
    if (!sourceMap.has(key)) {
      sourceMap.set(key, {
        source: format,
        formats: [],
      });
    }

    sourceMap.get(key).formats.push(format);
    sourceMap.get(key).source = selectPreferredFormat(
      sourceMap.get(key).source,
      format,
      type,
    );
  });

  return [...sourceMap.values()].flatMap(({ source, formats: sourceFormats }) =>
    VIDEO_CONVERSION_FPS_VALUES.filter(
      (targetFPS) => !hasMatchingFPS(sourceFormats, targetFPS),
    ).map((targetFPS) => ({
      ...source,
      container: "mp4",
      codec: "h264",
      filesize: null,
      fps: targetFPS,
      videoFps: targetFPS,
      converted: true,
    })),
  );
}

function getAudioConversionCapabilities() {
  const capabilities = state.currentVideo?.capabilities?.audioConversions;
  if (capabilities) {
    return {
      bitrates: Array.isArray(capabilities.bitrates)
        ? capabilities.bitrates.filter((bitrate) => Number(bitrate) > 0)
        : [],
      bitrateFormats: Array.isArray(capabilities.bitrateFormats)
        ? capabilities.bitrateFormats
        : [],
      losslessFormats: Array.isArray(capabilities.losslessFormats)
        ? capabilities.losslessFormats
        : [],
    };
  }

  if (!state.currentVideo?.capabilities?.mp3) {
    return {
      bitrates: [],
      bitrateFormats: [],
      losslessFormats: [],
    };
  }

  return {
    bitrates: AUDIO_CONVERSION_BITRATES,
    bitrateFormats: [{ id: "mp3", label: "MP3", extension: "mp3" }],
    losslessFormats: [],
  };
}

function getAudioConversionSource(formats) {
  return [...formats].sort((a, b) => {
    const preferred = { m4a: 1, mp4: 2, webm: 3 };
    return (
      (preferred[getContainer(a)] || 9) - (preferred[getContainer(b)] || 9) ||
      getAudioBitrateValue(b) - getAudioBitrateValue(a)
    );
  })[0];
}

function createConvertedAudioChoices(formats) {
  if (formats.length === 0) return [];

  const capabilities = getAudioConversionCapabilities();
  const source = getAudioConversionSource(formats);

  if (!source) return [];

  return capabilities.bitrates.flatMap((bitrate) =>
    capabilities.bitrateFormats.map((format) => ({
      ...source,
      container: format.extension || format.id,
      codec: AUDIO_OUTPUT_CODECS[format.id] || format.id,
      outputFormat: format.id,
      outputLabel: format.label,
      filesize: null,
      bitrate: `${bitrate} kbps`,
      abr: Number(bitrate),
      audioBitrate: Number(bitrate),
      converted: true,
    })),
  );
}

function createLosslessAudioChoices(formats) {
  if (formats.length === 0) return [];

  const capabilities = getAudioConversionCapabilities();
  const source = getAudioConversionSource(formats);
  if (!source) return [];

  return capabilities.losslessFormats.map((format) => ({
    ...source,
    container: format.extension || format.id,
    codec: AUDIO_OUTPUT_CODECS[format.id] || format.id,
    outputFormat: format.id,
    outputLabel: format.label,
    filesize: null,
    bitrate: format.label,
    abr: 0,
    audioBitrate: "",
    lossless: true,
    converted: true,
  }));
}

function addAudioGroupBadges(groups) {
  const bitrateGroups = groups.filter(
    (group) => group.groupKind === "bitrate" && group.sortValue > 0,
  );

  if (bitrateGroups.length === 0) return groups;
  if (bitrateGroups.length === 1) {
    bitrateGroups[0].badges = [...bitrateGroups[0].badges, "Only kbps tier"];
    return groups;
  }

  bitrateGroups[0].badges = [...bitrateGroups[0].badges, "Highest kbps"];
  bitrateGroups[bitrateGroups.length - 1].badges = [
    ...bitrateGroups[bitrateGroups.length - 1].badges,
    "Lowest kbps",
  ];
  return groups;
}

function createAudioGroups(formats) {
  const sortedFormats = [
    ...sortFormatsForDisplay(formats, "audio"),
    ...createConvertedAudioChoices(formats),
  ].sort(
    (a, b) =>
      getAudioBitrateGroupValue(b) - getAudioBitrateGroupValue(a) ||
      getContainer(a).localeCompare(getContainer(b)),
  );
  const losslessFormats = createLosslessAudioChoices(formats);
  const groups = [];
  const groupMap = new Map();

  sortedFormats.forEach((format) => {
    const bitrate = getAudioBitrateGroupValue(format);
    const key = bitrate ? `bitrate:${bitrate}` : "bitrate:unknown";
    if (!groupMap.has(key)) {
      const group = {
        id: key,
        title: bitrate ? `${bitrate} kbps` : "Bitrate unknown",
        subtitle: "Audio quality (bitrate)",
        groupKind: "bitrate",
        sortValue: bitrate,
        sortTier: bitrate ? 2 : 1,
        badges: [],
        choices: [],
      };
      groupMap.set(key, group);
      groups.push(group);
    }

    addChoice(groupMap.get(key), format, "audio");
  });

  losslessFormats.forEach((format) => {
    const key = `lossless:${getAudioOutputKey(format)}`;
    const group = {
      id: key,
      title: getAudioOutputLabel(format),
      subtitle: "Converted audio",
      groupKind: "lossless",
      sortValue: 0,
      sortTier: 0,
      badges: ["Converted"],
      choices: [format],
    };
    groups.push(group);
  });

  groups.sort(
    (a, b) =>
      b.sortTier - a.sortTier ||
      b.sortValue - a.sortValue ||
      a.title.localeCompare(b.title),
  );
  return addAudioGroupBadges(groups);
}

function createFormatGroups(type, formats) {
  if (type === "audio") return createAudioGroups(formats);
  return createVideoGroups(type, formats);
}

// Toast Notifications
function showToast(message, type = "info", duration = 4000) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const icons = {
    success: "✓",
    error: "✕",
    info: "ℹ",
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
    <button class="toast-close" aria-label="Close notification">×</button>
  `;

  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.addEventListener("click", () => {
    toast.style.animation = "slideIn 0.3s ease-out reverse";
    setTimeout(() => toast.remove(), 300);
  });

  toastContainer.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.animation = "slideIn 0.3s ease-out reverse";
        setTimeout(() => toast.remove(), 300);
      }
    }, duration);
  }

  return toast;
}

function showSupportPopup() {
  if (!supportPopup || !supportPopup.hidden) return;

  supportPopupPreviousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  supportPopup.hidden = false;
  document.body.classList.add("support-popup-open");

  requestAnimationFrame(() => {
    supportPopupCloseBtn?.focus();
  });
}

function hideSupportPopup() {
  if (!supportPopup || supportPopup.hidden) return;

  supportPopup.hidden = true;
  document.body.classList.remove("support-popup-open");
  hideSupportPopupStatus();

  if (supportPopupPreviousFocus) {
    supportPopupPreviousFocus.focus();
    supportPopupPreviousFocus = null;
  }
}

function setSupportPopupStatus(text, state) {
  if (!supportPopupStatusElement) return;

  supportPopupStatusElement.hidden = false;
  supportPopupStatusElement.classList.toggle("is-done", state === "done");
  supportPopupStatusElement.classList.toggle("is-error", state === "error");
  if (supportPopupStatusTextElement) {
    supportPopupStatusTextElement.textContent = text;
  }
}

function hideSupportPopupStatus() {
  if (!supportPopupStatusElement) return;
  supportPopupStatusElement.hidden = true;
}

// History Management
function migrateLegacyHistory() {
  try {
    if (
      localStorage.getItem(HISTORY_KEY) ||
      !localStorage.getItem(LEGACY_HISTORY_KEY)
    )
      return;
    localStorage.setItem(HISTORY_KEY, localStorage.getItem(LEGACY_HISTORY_KEY));
  } catch (error) {
    console.error("History migration error:", error);
  }
}

function loadHistory() {
  try {
    const parsedHistory = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    if (!Array.isArray(parsedHistory)) return [];

    const history = [
      ...new Set(
        parsedHistory.filter((url) => typeof url === "string" && url.trim()),
      ),
    ].slice(0, MAX_HISTORY);

    if (
      history.length !== parsedHistory.length ||
      history.some((url, index) => url !== parsedHistory[index])
    ) {
      persistHistory(history);
    }

    return history;
  } catch (error) {
    console.error("History load error:", error);
    return [];
  }
}

function persistHistory(history) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(history.slice(0, MAX_HISTORY)),
    );
  } catch (error) {
    console.error("History save error:", error);
  }
}

function saveToHistory(url) {
  const history = loadHistory();
  const filtered = history.filter((u) => u !== url);
  filtered.unshift(url);
  state.isHistoryExpanded = false;
  persistHistory(filtered);
  updateSuggestions();
}

function clearHistory() {
  if (!loadHistory().length) return;

  const confirmed = window.confirm(
    "Clear all recent links saved on this device?",
  );
  if (!confirmed) return;

  state.isHistoryExpanded = false;

  try {
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(LEGACY_HISTORY_KEY);
  } catch (error) {
    console.error("History clear error:", error);
  }

  updateSuggestions();
  showToast("Recent links cleared", "success");
}

function createSuggestionButton(url) {
  const btn = document.createElement("button");
  btn.className = "suggestion-btn";
  btn.type = "button";
  btn.textContent = url;
  btn.title = url;
  btn.addEventListener("click", () => {
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
  const history = loadHistory();
  suggestionsHeading?.querySelector(".history-more")?.remove();
  suggestionsList.innerHTML = "";
  clearHistoryBtn.hidden = history.length === 0;

  if (history.length <= VISIBLE_HISTORY_COUNT) {
    state.isHistoryExpanded = false;
  }

  if (history.length === 0) {
    suggestionsList.innerHTML =
      '<span class="text-tertiary">No history yet</span>';
    return;
  }

  const visibleHistory = history.slice(0, VISIBLE_HISTORY_COUNT);
  const hiddenHistory = history.slice(VISIBLE_HISTORY_COUNT);

  const actionsWrapper = document.createElement("div");
  actionsWrapper.className = "history-actions";

  visibleHistory.forEach((url) => {
    suggestionsList.appendChild(createSuggestionButton(url));
  });

  const moreWrapper = document.createElement("div");
  moreWrapper.className = "history-more";

  const menuId = "recentLinksMoreMenu";

  const menu = document.createElement("div");
  menu.className = "history-more-menu";
  menu.id = menuId;
  menu.hidden = !state.isHistoryExpanded;
  menu.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  hiddenHistory.forEach((url) => {
    menu.appendChild(createSuggestionButton(url));
  });

  if (hiddenHistory.length > 0) {
    const moreBtn = document.createElement("button");
    moreBtn.className = "history-toggle-btn";
    moreBtn.type = "button";
    moreBtn.textContent = `More (${hiddenHistory.length})`;
    moreBtn.setAttribute("aria-expanded", String(state.isHistoryExpanded));
    moreBtn.setAttribute("aria-controls", menuId);
    moreBtn.addEventListener("click", (event) => {
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
pasteBtn.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    urlInput.value = text;
    urlInput.focus();
  } catch (err) {
    showToast("Could not access clipboard", "error");
  }
});

// URL Validation
function getUrlWithProtocol(url) {
  const trimmedUrl = String(url || "").trim();
  if (/^https?:\/\//i.test(trimmedUrl)) return trimmedUrl;
  return `https://${trimmedUrl}`;
}

function normalizeHostname(hostname) {
  return String(hostname || "")
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "")
    .replace(/^mobile\./, "")
    .replace(/^web\./, "");
}

function hostMatches(hostname, platformHost) {
  return hostname === platformHost || hostname.endsWith(`.${platformHost}`);
}

function getSupportedPlatform(parsedUrl) {
  const hostname = normalizeHostname(parsedUrl.hostname);
  return (
    SUPPORTED_PLATFORMS.find((platform) =>
      platform.hosts.some((host) => hostMatches(hostname, host)),
    ) || null
  );
}

function getVideoIdFromPath(url) {
  const parts = url.pathname.split("/").filter(Boolean);
  const videoPathPrefixes = new Set(["shorts", "embed", "live", "v"]);

  if (url.hostname === "youtu.be") return parts[0] || "";
  if (videoPathPrefixes.has(parts[0])) return parts[1] || "";
  return "";
}

function normalizeYouTubeURL(url) {
  try {
    const parsedUrl = new URL(getUrlWithProtocol(url));
    const hostname = normalizeHostname(parsedUrl.hostname);

    if (!["youtube.com", "music.youtube.com", "youtu.be"].includes(hostname))
      return "";

    const videoId =
      parsedUrl.searchParams.get("v") || getVideoIdFromPath(parsedUrl);
    if (!/^[\w-]{6,}$/.test(videoId || "")) return "";

    return `https://www.youtube.com/watch?v=${videoId}`;
  } catch (error) {
    return "";
  }
}

function normalizeMediaURL(url) {
  try {
    const parsedUrl = new URL(getUrlWithProtocol(url));
    if (!["http:", "https:"].includes(parsedUrl.protocol)) return "";

    const platform = getSupportedPlatform(parsedUrl);
    if (!platform) return "";

    if (platform.id === "youtube") return normalizeYouTubeURL(url);

    parsedUrl.hash = "";
    return parsedUrl.href;
  } catch (error) {
    return "";
  }
}

function validateURL(url) {
  return Boolean(normalizeMediaURL(url));
}

function displayError(message) {
  urlError.textContent = message;
  urlError.style.display = "block";
}

function clearError() {
  urlError.style.display = "none";
}

function normalizeDownloadStats(stats = {}) {
  const total = Number(stats.totalDownloadCount ?? stats.downloadCount) || 0;
  const video = Number(stats.videoDownloadCount) || 0;
  const audio = Number(stats.audioDownloadCount) || 0;

  return {
    totalDownloadCount: Math.max(0, total),
    videoDownloadCount: Math.max(0, video),
    audioDownloadCount: Math.max(0, audio),
  };
}

function renderDownloadStats(stats) {
  state.downloadStats = normalizeDownloadStats(stats);
  downlyStatElement?.classList.remove("is-unavailable");

  if (totalDownloadCountElement) {
    totalDownloadCountElement.textContent = formatCount(
      state.downloadStats.totalDownloadCount,
    );
  }

  if (videoDownloadCountElement) {
    videoDownloadCountElement.textContent = formatCount(
      state.downloadStats.videoDownloadCount,
    );
  }

  if (audioDownloadCountElement) {
    audioDownloadCountElement.textContent = formatCount(
      state.downloadStats.audioDownloadCount,
    );
  }
}

function markDownloadCountUnavailable() {
  downlyStatElement?.classList.add("is-unavailable");
  [
    totalDownloadCountElement,
    videoDownloadCountElement,
    audioDownloadCountElement,
  ].forEach((element) => {
    if (element) element.textContent = "—";
  });
}

function renderCopyrightYear() {
  if (copyrightYearElement) {
    copyrightYearElement.textContent = String(new Date().getFullYear());
  }
}

function getStoredTheme() {
  try {
    const storedTheme = localStorage.getItem(THEME_KEY);
    return VALID_THEMES.has(storedTheme) ? storedTheme : "standard";
  } catch (error) {
    console.error("Theme load error:", error);
    return "standard";
  }
}

function persistTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    console.error("Theme save error:", error);
  }
}

function updateThemeToggle(theme) {
  if (!themeToggle) return;

  const isGlass = theme === "glass";
  themeToggle.dataset.theme = theme;
  themeToggle.setAttribute("aria-checked", String(isGlass));
  themeToggle.setAttribute(
    "aria-label",
    `Switch to ${isGlass ? "classic" : "pro"} UI`,
  );
  themeToggle.title = isGlass ? "Switch to classic UI" : "Switch to pro UI";
}

function applyTheme(theme, shouldPersist = false) {
  const normalizedTheme = VALID_THEMES.has(theme) ? theme : "standard";
  state.currentTheme = normalizedTheme;
  document.body.classList.toggle("theme-glass", normalizedTheme === "glass");
  document.body.dataset.uiTheme = normalizedTheme;
  updateThemeToggle(normalizedTheme);

  if (shouldPersist) {
    persistTheme(normalizedTheme);
  }
}

function clearThemeTransitionTimers() {
  themeTransitionTimers.forEach((timerId) => window.clearTimeout(timerId));
  themeTransitionTimers = [];
}

function finishThemeTransition() {
  themeTransition?.classList.remove("is-active", "to-glass", "to-standard");
  document.body.classList.remove("theme-morphing");
  state.isThemeSwitching = false;
  themeTransitionTimers = [];

  if (themeToggle) {
    themeToggle.disabled = false;
  }
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function switchTheme() {
  if (state.isThemeSwitching) return;

  const nextTheme = state.currentTheme === "glass" ? "standard" : "glass";

  if (!themeTransition || prefersReducedMotion()) {
    applyTheme(nextTheme, true);
    return;
  }

  state.isThemeSwitching = true;
  if (themeToggle) {
    themeToggle.disabled = true;
  }

  clearThemeTransitionTimers();
  themeTransition.classList.remove("is-active", "to-glass", "to-standard");
  void themeTransition.offsetWidth;
  themeTransition.classList.add("is-active", `to-${nextTheme}`);
  document.body.classList.add("theme-morphing");

  themeTransitionTimers.push(
    window.setTimeout(() => applyTheme(nextTheme, true), 520),
    window.setTimeout(finishThemeTransition, 1380),
  );
}

// API Calls
async function fetchDownloadStats() {
  try {
    const response = await fetch(`${API_BASE}/stats`);
    if (!response.ok) throw new Error("Stats unavailable");

    const stats = await response.json();
    renderDownloadStats(stats);
  } catch (error) {
    console.error("Stats fetch error:", error);
    markDownloadCountUnavailable();
  }
}

async function fetchCreatorStats() {
  if (!creatorViewCountElement && !creatorRecentTitleElement) return;

  try {
    const response = await fetch(`${API_BASE}/creator-stats`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new Error("Creator stats request failed");

    const data = await response.json();
    const views = Number(data.views) || 0;
    if (creatorViewCountElement) {
      creatorViewCountElement.textContent = views
        ? `${formatViews(views)} views`
        : "Views unavailable";
    }
    renderCreatorLatestVideo(data.latestVideo);
  } catch (error) {
    if (creatorViewCountElement) {
      creatorViewCountElement.textContent = "Views unavailable";
    }
  }
}

function renderCreatorLatestVideo(latestVideo) {
  if (!latestVideo || !latestVideo.id) return;

  if (creatorRecentLinkElement) {
    creatorRecentLinkElement.href = latestVideo.url;
  }
  if (creatorRecentThumbElement) {
    creatorRecentThumbElement.src = latestVideo.thumbnail;
  }
  if (creatorRecentTitleElement) {
    creatorRecentTitleElement.textContent = latestVideo.title || "Watch the latest upload";
  }
  if (popupRecentLinkElement) {
    popupRecentLinkElement.href = latestVideo.url;
  }
  if (popupRecentThumbElement) {
    popupRecentThumbElement.src = latestVideo.thumbnail;
  }
  if (popupRecentTitleElement) {
    popupRecentTitleElement.textContent = latestVideo.title || "Watch the latest upload";
  }
}

function showLoadingPromo() {
  if (!loadingPromoElement) return;

  window.clearTimeout(loadingPromoTimer);
  loadingPromoTimer = window.setTimeout(() => {
    loadingPromoElement.hidden = false;
  }, 3000);
}

function hideLoadingPromo() {
  window.clearTimeout(loadingPromoTimer);
  if (loadingPromoElement) loadingPromoElement.hidden = true;
}

function getStatsDownloadType(formatType) {
  return formatType === "audio" ? "audio" : "video";
}

async function incrementDownloadCount(url, formatType) {
  try {
    const response = await fetch(`${API_BASE}/stats/increment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        type: getStatsDownloadType(formatType),
      }),
    });

    if (!response.ok) throw new Error("Stats update failed");

    const stats = await response.json();
    renderDownloadStats(stats);
  } catch (error) {
    console.error("Stats update error:", error);
    markDownloadCountUnavailable();
  }
}

async function fetchVideoInfo(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VIDEO_INFO_TIMEOUT_MS);

  try {
    const response = await fetch(`${API_BASE}/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      console.error("API Error:", error);
      throw new Error(
        error.details || error.error || "Failed to fetch video info",
      );
    }

    const data = await response.json();
    console.log("Video Data:", data);
    console.log("Formats - Progressive:", data.formats.progressive.length);
    console.log("Formats - Video:", data.formats.video.length);
    console.log("Formats - Audio:", data.formats.audio.length);
    return data;
  } catch (error) {
    console.error("Fetch error:", error);
    if (error.name === "AbortError") {
      throw new Error(
        "Timed out fetching video information. Try again, or paste the single-video watch URL without playlist/radio parameters.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function getDownloadFrame() {
  const frameName = "downlyDownloadFrame";
  let frame = document.querySelector(`iframe[name="${frameName}"]`);

  if (!frame) {
    frame = document.createElement("iframe");
    frame.name = frameName;
    frame.style.display = "none";
    frame.setAttribute("aria-hidden", "true");
    document.body.appendChild(frame);
  }

  return frame;
}

function submitDownloadForm(fields) {
  const frame = getDownloadFrame();
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `${API_BASE}/download`;
  form.target = frame.name;
  form.style.display = "none";

  Object.entries(fields).forEach(([name, value]) => {
    if (value === undefined || value === null || value === "") return;
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  window.setTimeout(() => form.remove(), 1000);

  return frame;
}

// The download frame navigates (fires "load" with a JSON body) only when the
// server responds with an error instead of a file attachment. A successful
// attachment response never triggers "load", so we can't confirm success —
// only surface failures, which is what previously went silent.
function readDownloadFrameError(frame) {
  try {
    const doc = frame.contentDocument;
    const text = doc?.body?.innerText?.trim();
    if (!text) return null;
    const data = JSON.parse(text);
    return data?.details || data?.error || null;
  } catch (error) {
    return null;
  }
}

function waitForDownloadOutcome(frame, graceMs) {
  return new Promise((resolve) => {
    let settled = false;

    const onLoad = () => {
      const message = readDownloadFrameError(frame);
      if (!message) return;
      if (!settled) {
        settled = true;
        window.clearTimeout(graceTimer);
        frame.removeEventListener("load", onLoad);
        resolve(message);
      } else {
        // Error surfaced after we already assumed success (e.g. a slow
        // server-side timeout) — still let the user know it failed.
        showToast(message, "error");
        frame.removeEventListener("load", onLoad);
      }
    };

    frame.addEventListener("load", onLoad);

    const graceTimer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    }, graceMs);
  });
}

async function downloadFormat(url, format, filename, onTick) {
  const frame = submitDownloadForm({
    url,
    formatId: format.id,
    filename,
    container: format.container,
    outputFormat: format.outputFormat,
    mergeOutputFormat: format.mergeOutputFormat,
    audioBitrate: format.audioBitrate,
    videoFps: format.videoFps,
  });

  // Merged/converted formats are processed server-side before the first
  // byte ships, so give them longer before assuming success.
  let graceMs = 6000;
  if (format.merged) graceMs += 6000;
  if (format.outputFormat || format.videoFps) graceMs += 8000;

  // Real browser-visible download start lags slightly behind the moment we
  // stop watching for errors — pad so "done" isn't announced too early.
  const settleMs = 2500;

  const totalSeconds = Math.round(graceMs / 1000);
  let remainingSeconds = totalSeconds;

  if (onTick) onTick(remainingSeconds, totalSeconds);
  const tickTimer = onTick
    ? window.setInterval(() => {
        remainingSeconds = Math.max(0, remainingSeconds - 1);
        onTick(remainingSeconds, totalSeconds);
      }, 1000)
    : null;

  try {
    const errorMessage = await waitForDownloadOutcome(frame, graceMs);
    if (errorMessage) {
      throw new Error(errorMessage);
    }
    await new Promise((resolve) => window.setTimeout(resolve, settleMs));
  } finally {
    if (tickTimer) window.clearInterval(tickTimer);
  }
}

// UI Rendering
function showSection(section) {
  const sectionDisplay = {
    hero: [heroSection, "flex"],
    why: [whyChooseSection, "block"],
    steps: [howToDownloadSection, "block"],
  };
  const activeSection = sectionDisplay[section];

  heroSection.style.display = activeSection?.[0] === heroSection ? "flex" : "none";
  whyChooseSection.style.display = activeSection?.[0] === whyChooseSection ? "block" : "none";
  howToDownloadSection.style.display = activeSection?.[0] === howToDownloadSection ? "block" : "none";
  loadingSection.style.display = section === "loading" ? "flex" : "none";
  videoDetailsSection.style.display = section === "details" ? "block" : "none";
}

function scrollToElement(element) {
  requestAnimationFrame(() => {
    element.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  });
}

function navigateToHash(hash) {
  const targetHash = hash || "#downloader";
  const target = document.querySelector(targetHash);

  if (!target) return;

  if (targetHash === "#whyChoose") showSection("why");
  if (targetHash === "#howToDownload") showSection("steps");
  if (
    targetHash === "#downloader" ||
    targetHash === "#creatorSpotlight" ||
    targetHash === "#support"
  ) showSection("hero");

  if (window.location.hash !== targetHash) {
    window.history.pushState(null, "", targetHash);
  }

  scrollToElement(target);

  if (targetHash === "#downloader") {
    urlInput.focus({ preventScroll: true });
  }
}

function activateTab(tabName) {
  document.querySelectorAll(".tab-button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  document.querySelectorAll(".tab-content").forEach((content) => {
    const isActive = content.id === tabName;
    content.classList.toggle("active", isActive);
    content.style.display = isActive ? "block" : "none";
  });

  state.currentTab = tabName;
}

function renderVideoDetails(data) {
  state.currentVideo = data;
  const platformClass = `platform-${String(data.platform || "media")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;

  videoDetailsSection.className = `video-details ${platformClass}`;
  document.getElementById("thumbnail").src = data.thumbnail;
  document.getElementById("videoTitle").textContent = data.title;
  document.getElementById("uploader").textContent = data.uploader;
  document.getElementById("duration").textContent = formatDuration(
    data.duration,
  );
  document.getElementById("views").textContent = formatViews(data.views);
  document.getElementById("uploadDate").textContent = formatDate(
    data.uploadDate,
  );
  document.getElementById("description").textContent = data.description;

  // Render tables
  renderFormatTable("progressive", data.formats.progressive);
  renderFormatTable("video", data.formats.video);
  renderFormatTable("audio", data.formats.audio);
  activateTab("progressive");
}

function renderFormatTable(type, formats) {
  const formatList = document.getElementById(`${type}Table`);
  const emptyState = document.getElementById(`${type}Empty`);

  formatList.innerHTML = "";

  if (!formats || formats.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  const groups = createFormatGroups(type, formats);
  if (groups.length === 0) {
    emptyState.style.display = "block";
    return;
  }

  emptyState.style.display = "none";

  groups.forEach((group, index) => {
    const row = document.createElement("div");
    row.className = "format-row";
    row.style.animationDelay = `${index * 0.04}s`;
    row.innerHTML = `
      <div class="format-quality">
        <div class="quality-title-row">
          <span class="quality-title">${escapeHTML(group.title)}</span>
          <span class="quality-badges">
            ${group.badges
              .map((badge) => {
                const badgeClass = badge.includes("Lowest")
                  ? "is-low"
                  : badge.includes("Best") || badge.includes("Highest")
                    ? "is-best"
                    : badge.includes("HDR")
                      ? "is-hdr"
                      : "is-neutral";
                return `<span class="quality-badge ${badgeClass}">${escapeHTML(badge)}</span>`;
              })
              .join("")}
          </span>
        </div>
        <span class="quality-subtitle">${escapeHTML(group.subtitle)}</span>
      </div>
      <div class="format-actions" aria-label="Download choices"></div>
    `;

    const actions = row.querySelector(".format-actions");
    group.choices
      .sort((a, b) => {
        const order = {
          mp3: 1,
          m4a: 2,
          ogg: 3,
          opus: 4,
          webm: 5,
          flac: 6,
          wav: 7,
          alac: 8,
          mp4: 9,
        };
        return (order[getContainer(a)] || 9) - (order[getContainer(b)] || 9);
      })
      .forEach((format) => {
        const containerLabel =
          type === "audio"
            ? getAudioOutputLabel(format)
            : sanitizeDownloadPart(format.container).toUpperCase();
        const rawSizeLabel =
          format.converted && type === "audio"
            ? ""
            : format.converted
              ? "Converted"
              : formatFileSize(format.filesize);
        const sizeLabel = rawSizeLabel === "Unknown" ? "" : rawSizeLabel;
        const codecLabel = getReadableCodecLabel(format, type);
        const rawAudioCodecLabel = sanitizeDownloadPart(format.audioCodec, "");
        const audioCodecLabel =
          rawAudioCodecLabel && rawAudioCodecLabel !== "Unknown"
            ? rawAudioCodecLabel
            : "audio";
        const hdrLabel = getHDRLabel(format);
        const metaLabel = format.merged
          ? `${codecLabel} + ${audioCodecLabel}`
          : codecLabel;
        const audioBitrateLabel =
          type === "audio" ? getAudioBitrateLabel(format) : "";
        const audioSourceLabel =
          type === "audio" ? (format.converted ? "Converted" : "Original") : "";
        const detailLabel =
          type === "audio"
            ? [
                audioSourceLabel,
                metaLabel,
                format.lossless ? "" : audioBitrateLabel,
                sizeLabel,
              ]
                .filter(Boolean)
                .join(" · ")
            : [metaLabel, hdrLabel, sizeLabel].filter(Boolean).join(" · ");
        const titleLabel =
          type === "audio"
            ? [
                audioSourceLabel,
                metaLabel,
                format.lossless ? "" : audioBitrateLabel,
                rawSizeLabel,
              ]
                .filter(Boolean)
                .join(" · ")
            : [metaLabel, hdrLabel, rawSizeLabel].filter(Boolean).join(" · ");
        const button = document.createElement("button");
        button.className = "download-btn";
        button.dataset.formatId = format.id;
        button.type = "button";
        button.title = `${containerLabel} · ${titleLabel}`;
        button.innerHTML = `
          <span class="download-icon" aria-hidden="true">↓</span>
          <span class="download-label">${escapeHTML(containerLabel || "FILE")}</span>
          <span class="download-meta">${escapeHTML(detailLabel)}</span>
        `;
        button.addEventListener("click", () =>
          handleDownload(button, format, type),
        );
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
    displayError("Please enter a video or audio URL");
    return;
  }

  if (!normalizedUrl) {
    displayError(`Unsupported URL. Try: ${SUPPORTED_PLATFORM_LABELS}`);
    return;
  }

  state.isLoading = true;
  getVideoBtn.disabled = true;
  urlInput.disabled = true;
  showSection("loading");
  showLoadingPromo();

  try {
    const data = await fetchVideoInfo(normalizedUrl);
    state.currentUrl = normalizedUrl;
    data.sourceUrl = normalizedUrl;
    urlInput.value = normalizedUrl;
    saveToHistory(normalizedUrl);
    clearError();
    renderVideoDetails(data);
    showSection("details");
    scrollToElement(videoDetailsSection);
    showToast("Video loaded successfully!", "success");
  } catch (error) {
    showSection("hero");
    clearError();
    displayError(error.message || "Failed to fetch video information");
    showToast(error.message || "Error loading video", "error");
  } finally {
    hideLoadingPromo();
    state.isLoading = false;
    getVideoBtn.disabled = false;
    urlInput.disabled = false;
  }
}

async function handleDownload(btn, format, type) {
  const formatId = getDownloadKey(format);

  if (state.downloadingFormats.has(formatId)) return;

  const downloadUrl =
    state.currentVideo?.sourceUrl || state.currentUrl || urlInput.value.trim();
  const normalizedDownloadUrl = normalizeMediaURL(downloadUrl);
  if (!downloadUrl || !normalizedDownloadUrl) {
    showToast("Original media URL is missing. Please load it again.", "error");
    return;
  }

  state.downloadingFormats.add(formatId);
  btn.disabled = true;
  btn.classList.add("loading");

  showSupportPopup();

  try {
    await downloadFormat(
      normalizedDownloadUrl,
      format,
      buildDownloadFilename(type, format),
      (remainingSeconds, totalSeconds) => {
        if (remainingSeconds > 0) {
          setSupportPopupStatus(
            `You might see it in your downloads in about ${remainingSeconds}s...`,
          );
        } else {
          setSupportPopupStatus("Almost there — hang tight a moment.");
        }
      },
    );
    incrementDownloadCount(normalizedDownloadUrl, type);
    setSupportPopupStatus(
      "It should be in your downloads now.",
      "done",
    );
  } catch (error) {
    setSupportPopupStatus(error.message || "Download failed", "error");
    showToast(error.message || "Download failed", "error");
  } finally {
    state.downloadingFormats.delete(formatId);
    btn.disabled = false;
    btn.classList.remove("loading");
  }
}

function handleBack() {
  navigateToHash("#downloader");
}

function handleCurrentHash() {
  const appHashes = [
    "#downloader",
    "#whyChoose",
    "#howToDownload",
    "#creatorSpotlight",
    "#support",
  ];
  if (appHashes.includes(window.location.hash)) {
    navigateToHash(window.location.hash);
  } else {
    showSection("hero");
  }
}

// Tab Navigation
document.querySelectorAll(".tab-button").forEach((btn) => {
  btn.addEventListener("click", () => {
    activateTab(btn.dataset.tab);
  });
});

// Description Toggle
toggleDescBtn.addEventListener("click", () => {
  const isVisible = descriptionElement.style.display !== "none";
  if (isVisible) {
    descriptionElement.style.display = "none";
    toggleDescBtn.textContent = "Show Description";
  } else {
    descriptionElement.style.display = "block";
    toggleDescBtn.textContent = "Hide Description";
  }
});

// Drag and Drop
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.style.display = "flex";
});

dropZone.addEventListener("dragleave", () => {
  dropZone.style.display = "none";
});

dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.style.display = "none";

  const text = e.dataTransfer.getData("text/plain");
  const normalizedUrl = normalizeMediaURL(text);
  if (normalizedUrl) {
    urlInput.value = normalizedUrl;
    handleGetVideo();
  } else {
    displayError(`Unsupported URL dropped. Try: ${SUPPORTED_PLATFORM_LABELS}`);
  }
});

// Keyboard Shortcuts
urlInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    handleGetVideo();
  }
});

urlInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    urlInput.value = "";
    clearError();
  }
});

// Event Listeners
getVideoBtn.addEventListener("click", handleGetVideo);
backBtn.addEventListener("click", handleBack);
clearHistoryBtn.addEventListener("click", clearHistory);
themeToggle?.addEventListener("click", switchTheme);
supportPopupCloseBtn?.addEventListener("click", hideSupportPopup);
supportPopupLaterBtn?.addEventListener("click", hideSupportPopup);
supportPopup?.addEventListener("click", (event) => {
  const target = event.target;
  if (
    target === supportPopup ||
    (target instanceof Element && target.closest(".support-popup-btn"))
  ) {
    hideSupportPopup();
  }
});
samePageLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    navigateToHash(link.getAttribute("href"));
  });
});
window.addEventListener("hashchange", handleCurrentHash);
window.addEventListener("popstate", handleCurrentHash);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && supportPopup && !supportPopup.hidden) {
    hideSupportPopup();
    return;
  }

  if (event.key === "Escape") {
    closeHistoryMenu();
  }
});
document.addEventListener("click", (event) => {
  const target = event.target;
  if (
    state.isHistoryExpanded &&
    target instanceof Element &&
    !target.closest(".history-more")
  ) {
    closeHistoryMenu();
  }
});

// Initialize
applyTheme(getStoredTheme());
migrateLegacyHistory();
updateSuggestions();
fetchDownloadStats();
fetchCreatorStats();
renderCopyrightYear();
handleCurrentHash();
