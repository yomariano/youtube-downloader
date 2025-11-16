# YouTube Downloader with BrightData Proxy

A modern YouTube downloader application with a React frontend and Node.js backend that uses BrightData proxy for reliable video downloads.

## Features

- Clean and modern UI built with React
- Download YouTube videos in MP4 format with quality selection
- Convert and download as MP3 audio with bitrate options
- BrightData proxy integration for stable downloads
- Video preview with thumbnail and metadata
- Automatic file cleanup after download

## Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- FFmpeg installed on your system (required for MP3 conversion)

### Installing FFmpeg

**Windows:**
```bash
# Using Chocolatey
choco install ffmpeg

# Or download from https://ffmpeg.org/download.html
```

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

## Installation

1. Install all dependencies:
```bash
npm run install-all
```

This will install dependencies for the root, client, and server directories.

Alternatively, install manually:
```bash
# Install root dependencies
npm install

# Install client dependencies
cd client
npm install

# Install server dependencies
cd ../server
npm install
```

## Configuration

The BrightData proxy credentials are already configured in `server/.env`:

```env
PROXY_HOST=brd.superproxy.io
PROXY_PASSWORD=713k00vtlyvt
PROXY_PORT=9222
PROXY_USERNAME=brd-customer-hl_356602a2-zone-scraping_browser1
PORT=3001
```

You can modify these values if needed.

## Running the Application

### Development Mode

Run both client and server concurrently:
```bash
npm run dev
```

Or run them separately:

**Terminal 1 - Server:**
```bash
npm run server
```

**Terminal 2 - Client:**
```bash
npm run client
```

The application will be available at:
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Usage

1. Open your browser and navigate to `http://localhost:3000`
2. Paste a YouTube URL into the input field
3. Click "Fetch Info" to load video information
4. Select your preferred format:
   - **MP4**: Choose video quality (1080p, 720p, 480p, etc.)
   - **MP3**: Choose audio bitrate (320kbps, 192kbps, 128kbps, etc.)
5. Click the download button to start downloading

## Project Structure

```
snapsumbot/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.jsx        # Main application component
│   │   ├── App.css        # Application styles
│   │   ├── main.jsx       # React entry point
│   │   └── index.css      # Global styles
│   ├── index.html         # HTML template
│   ├── vite.config.js     # Vite configuration
│   └── package.json
├── server/                # Node.js backend
│   ├── index.js          # Express server
│   ├── .env              # Environment variables
│   └── package.json
├── package.json          # Root package.json
└── README.md

```

## API Endpoints

### POST /api/video-info
Fetches video metadata and available formats.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=..."
}
```

**Response:**
```json
{
  "title": "Video Title",
  "duration": 180,
  "thumbnail": "https://...",
  "videoFormats": [...],
  "audioFormats": [...]
}
```

### POST /api/download
Downloads the video in the specified format.

**Request:**
```json
{
  "url": "https://www.youtube.com/watch?v=...",
  "outputFormat": "mp4",
  "quality": "itag_value_or_bitrate"
}
```

**Response:** File download stream

## Technologies Used

### Frontend
- React 18
- Vite
- Axios
- Modern CSS with gradient backgrounds

### Backend
- Express.js
- @distube/ytdl-core (YouTube download library)
- fluent-ffmpeg (Media conversion)
- https-proxy-agent (BrightData proxy support)
- dotenv (Environment configuration)

## Docker Deployment

### Using Docker Compose (Local Testing)

Build and run with Docker Compose:
```bash
docker-compose up --build
```

The application will be available at http://localhost:80

### Deploying to Coolify (Hetzner/Ubuntu Server)

Coolify will automatically handle FFmpeg installation through Docker, so you **don't need to install FFmpeg on your Ubuntu server**.

#### Option 1: Using Docker Compose (Recommended)

1. Push your code to a Git repository (GitHub, GitLab, etc.)

2. In Coolify, create a new resource and select "Docker Compose"

3. Connect your Git repository

4. Coolify will automatically detect the `docker-compose.yml` file

5. Set environment variables in Coolify:
   - `PROXY_HOST`: brd.superproxy.io
   - `PROXY_PASSWORD`: 713k00vtlyvt
   - `PROXY_PORT`: 9222
   - `PROXY_USERNAME`: brd-customer-hl_356602a2-zone-scraping_browser1

6. Deploy! Coolify will:
   - Build both client and server Docker images
   - FFmpeg will be automatically installed in the server container
   - Start the services
   - Set up SSL if you've configured a domain

#### Option 2: Separate Services

You can also deploy client and server as separate Coolify services:

**Server Service:**
- Type: Dockerfile
- Build Pack: Dockerfile
- Dockerfile Location: `./server/Dockerfile`
- Port: 3001
- Health Check: `/api/health`

**Client Service:**
- Type: Dockerfile
- Build Pack: Dockerfile
- Dockerfile Location: `./client/Dockerfile`
- Port: 80
- Add environment variable `VITE_API_URL` pointing to your server URL

#### Important Notes for Coolify:

1. **No FFmpeg installation needed on the host**: The Dockerfile handles FFmpeg installation inside the container using `apk add --no-cache ffmpeg`

2. **Storage**: Consider adding a persistent volume for `/app/downloads` if you want to keep files longer

3. **Memory**: YouTube downloads can be memory-intensive. Monitor your server resources.

4. **Environment Variables**: Make sure to set all proxy credentials in Coolify's environment settings

5. **Domain Setup**: Configure your domain in Coolify to get automatic SSL with Let's Encrypt

### Building Docker Images Manually

Build server image:
```bash
cd server
docker build -t youtube-downloader-server .
```

Build client image:
```bash
cd client
docker build -t youtube-downloader-client .
```

Run containers:
```bash
# Run server
docker run -d \
  -p 3001:3001 \
  -e PROXY_HOST=brd.superproxy.io \
  -e PROXY_PASSWORD=713k00vtlyvt \
  -e PROXY_PORT=9222 \
  -e PROXY_USERNAME=brd-customer-hl_356602a2-zone-scraping_browser1 \
  youtube-downloader-server

# Run client
docker run -d -p 80:80 youtube-downloader-client
```

## Troubleshooting

### FFmpeg not found
If you get an error about FFmpeg not being found, make sure it's installed and available in your system PATH.

### Proxy connection issues
If downloads fail due to proxy issues, verify your BrightData credentials in `server/.env`.

### Port already in use
If port 3000 or 3001 is already in use, you can change them:
- Client: Edit `client/vite.config.js`
- Server: Edit `server/.env`

### Video download fails
Some videos may be restricted or require authentication. The application works best with publicly available YouTube videos.

## Notes

- Downloaded files are automatically deleted from the server after 1 minute
- The application uses BrightData proxy to avoid rate limiting
- MP3 conversion requires FFmpeg to be installed
- Large videos may take longer to download and convert

## License

MIT
