# Downly

A modern, production-quality web application for downloading video and audio content from supported media platforms. Built with vanilla JavaScript, Node.js, Express, and yt-dlp.

## ⚠️ Important Legal Notice

This application is designed to download only content that you own or have explicit permission to download, in compliance with each platform's terms of service and applicable copyright laws. Users are responsible for ensuring their use complies with all applicable laws and platform terms.

## Features

- **Modern UI** - Dark theme with glassmorphism and smooth animations
- **Format Selection** - Download video, audio, or combined formats
- **Quality Display** - Shows resolution, bitrate, codec, file size, and more
- **Search History** - Remembers your last 10 searches
- **Clipboard Support** - Quick paste button and drag-and-drop
- **Responsive Design** - Works perfectly on desktop, tablet, and mobile
- **Format Separation** - Automatic separation of video/audio formats
- **Error Handling** - User-friendly error messages for various scenarios
- **Keyboard Shortcuts** - Enter to submit, Escape to clear
- **Toast Notifications** - Beautiful feedback for all user actions

## Technology Stack

### Frontend
- HTML5
- CSS3 (with CSS Grid, Flexbox, animations)
- Vanilla JavaScript (ES6+)

### Backend
- Node.js
- Express.js
- yt-dlp (media extraction)
- FFmpeg (media processing)

## Installation

### Prerequisites

1. **Node.js** (v14 or higher)
   - Download from https://nodejs.org/

2. **yt-dlp**
   ```bash
   # macOS (using Homebrew)
   brew install yt-dlp
   
   # Ubuntu/Debian
   sudo apt-get install yt-dlp
   
   # Windows (using Chocolatey)
   choco install yt-dlp
   
   # Or install via pip
   pip install yt-dlp
   ```

3. **FFmpeg** (optional, but recommended for audio conversion)
   ```bash
   # macOS
   brew install ffmpeg
   
   # Ubuntu/Debian
   sudo apt-get install ffmpeg
   
   # Windows (using Chocolatey)
   choco install ffmpeg
   ```

### Setup

1. **Clone/Download the project**
   ```bash
   cd "Downly"
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the server**
   ```bash
   npm start
   ```

   For development with auto-reload:
   ```bash
   npm run dev
   ```

4. **Open in browser**
   ```
   http://localhost:3000
   ```

## Project Structure

```
Downly/
├── project/
│   ├── index.html         # Main HTML page
│   ├── style.css          # Styling (glassmorphism, dark theme)
│   └── script.js          # Frontend JavaScript (vanilla)
├── server/
│   ├── server.js          # Express server setup
│   ├── routes.js          # API endpoints
│   └── package.json       # Dependencies
├── temp/                  # Temporary download storage (auto-created)
└── README.md             # This file
```

## API Endpoints

### POST `/api/info`
Retrieves available formats for a supported media URL.

**Request:**
```json
{
  "url": "https://youtube.com/watch?v=..."
}
```

**Response:**
```json
{
  "title": "Video Title",
  "thumbnail": "https://...",
  "duration": 3600,
  "uploader": "Channel Name",
  "views": 1000000,
  "uploadDate": "20240101",
  "description": "Video description...",
  "channelName": "Channel Name",
  "formats": {
    "video": [...],
    "audio": [...],
    "progressive": [...]
  }
}
```

### POST `/api/download`
Downloads a specific format.

**Request:**
```json
{
  "url": "https://youtube.com/watch?v=...",
  "formatId": "22"
}
```

**Response:** Binary file stream

## Using yt-dlp

The application uses yt-dlp to extract video metadata and formats. yt-dlp is a maintained fork of youtube-dl with better support and more frequent updates.

### Automated YouTube PO tokens

YouTube may require short-lived proof-of-origin tokens. The production build automatically installs the `bgutil-ytdlp-pot-provider` yt-dlp plugin. For production YouTube reliability, run the companion provider service described in [`infra/bgutil-provider/README.md`](infra/bgutil-provider/README.md), then set `YTDLP_POT_PROVIDER_URL` in Vercel. This removes the need to manually rotate browser cookies for public videos.

### Supported Sites
- youtube.com
- youtu.be
- music.youtube.com
- And many more (see yt-dlp documentation)

### Format Info
- **Video formats** - Video-only streams (requires audio to be merged)
- **Audio formats** - Audio-only streams (MP3, M4A, etc.)
- **Progressive formats** - Video + audio combined (no merging needed)

### Video Qualities

- 144p
- 240p
- 360p
- 480p
- 720p (HD)
- 1080p (Full HD)
- 1440p (2K)
- 2160p (4K)
- 4320p (8K)

### Video Formats

- MP4
- WebM
- MKV

### Video FPS

- 24 fps
- 30 fps
- 59.94 fps
- 60 fps

### Audio Formats

- MP3
- M4A
- AAC
- Opus
- WAV
- FLAC
- OGG

### Audio Quality (Bitrate)

- 64 kbps
- 128 kbps
- 192 kbps
- 256 kbps
- 320 kbps

## Features Guide

### Paste from Clipboard
Click the 📋 button next to the URL input to automatically paste your clipboard contents.

### Search History
The 9 most recent URLs appear below the input field for quick access. They are stored only in the user's browser storage, and users can clear them after confirmation.

### Format Tabs
- **Video & Audio** - Combined formats (ready to play)
- **Video Only** - Requires FFmpeg to combine with audio
- **Audio Only** - Audio streams and music

### Drag and Drop
Drag a supported media URL anywhere on the page to automatically populate the input field.

### Keyboard Shortcuts
- **Enter** - Fetch video information
- **Escape** - Clear the URL input

## Troubleshooting

### "yt-dlp command not found"
Ensure yt-dlp is installed and in your system PATH. Test with:
```bash
yt-dlp --version
```

### "Video unavailable" or "Could not retrieve video information"
- The video may be private, age-restricted, or region-blocked
- YouTube may have changed their format
- Try updating yt-dlp: `pip install --upgrade yt-dlp`

### YouTube asks to sign in or confirm you are not a bot
Downly does not request, store, or use YouTube/Google account cookies by default. If YouTube blocks an anonymous request from the hosting provider, the app reports that limitation instead of asking users to upload personal browser data.

### Download fails or is slow
- Check your internet connection
- Some videos have size restrictions
- Server may need more time for large files
- Increase timeout in routes.js if needed

### FFmpeg not found
If you see FFmpeg errors during audio conversion:
1. Install FFmpeg (see Prerequisites)
2. Ensure it's in your system PATH
3. Test with: `ffmpeg -version`

## Performance Notes

- Videos are downloaded to a temporary directory and deleted after transmission
- Large video files may take time to process
- File size limits depend on your server's available disk space
- Consider implementing rate limiting for production use

## Security Considerations

✓ URL validation on both client and server
✓ Command injection prevention (input sanitization)
✓ File cleanup after download
✓ No unsanitized input execution
✓ Proper error handling without exposing system details

## Browser Support

- Chrome/Chromium (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Limitations

- Progressive formats have audio included (no merging needed)
- Video-only formats need FFmpeg for audio merging
- Some videos may have region restrictions
- Age-restricted content requires YouTube authentication
- Live streams may not be downloadable

## Development

### Adding Features
1. Frontend changes: Edit `project/script.js` or `project/style.css`
2. Backend changes: Edit `server/routes.js`
3. UI changes: Edit `project/index.html`

### Testing
Test with various video types:
- Public videos
- Long videos (2+ hours)
- 4K/8K videos
- Music videos (may have different formats)
- Videos with age restriction (will fail - expected)

## License

MIT

## Contributing

Feel free to submit issues and pull requests.

## Disclaimer

This application is provided as-is for personal use only. Users are responsible for ensuring their downloads comply with each platform's terms of service and all applicable laws. The developers are not responsible for misuse of this application.

## Support

For issues with:
- **yt-dlp**: See https://github.com/yt-dlp/yt-dlp
- **FFmpeg**: See https://ffmpeg.org/
- **This application**: Check troubleshooting section above

---

Downly helps keep format choices clean and downloads intentional.
