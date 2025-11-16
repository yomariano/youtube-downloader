import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import youtubedl from 'youtube-dl-exec';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// Configure proxy if available
const getProxyUrl = () => {
  // TEMPORARILY DISABLED - Testing without proxy first
  return null;

  // if (process.env.PROXY_USERNAME && process.env.PROXY_HOST) {
  //   return `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
  // }
  // return null;
};

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    proxy: getProxyUrl() ? 'enabled' : 'disabled'
  });
});

// Get video info endpoint
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    console.log('Fetching video info for:', url);

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Validate YouTube URL
    if (!url.includes('youtube.com') && !url.includes('youtu.be')) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    const options = {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      // Add user agent to bypass bot detection
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      // Add additional options for better success
      addHeader: ['Accept-Language:en-US,en;q=0.9', 'Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8']
    };

    // Add proxy if configured
    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      options.proxy = proxyUrl;
      console.log('Using proxy for yt-dlp');
    } else {
      console.log('No proxy configured - direct connection');
    }

    const info = await youtubedl(url, options);

    console.log('Successfully fetched video info:', info.title);

    // Format video formats for frontend
    const videoFormats = info.formats
      ?.filter(f => f.vcodec !== 'none' && f.acodec !== 'none')
      .map(f => ({
        quality: f.format_note || f.resolution || 'unknown',
        format: f.ext,
        itag: f.format_id,
        hasAudio: f.acodec !== 'none',
        hasVideo: f.vcodec !== 'none'
      }))
      .filter((v, i, a) => a.findIndex(t => t.quality === v.quality) === i)
      .sort((a, b) => {
        const aRes = parseInt(a.quality) || 0;
        const bRes = parseInt(b.quality) || 0;
        return bRes - aRes;
      }) || [];

    // Format audio formats for frontend
    const audioFormats = info.formats
      ?.filter(f => f.acodec !== 'none' && f.vcodec === 'none')
      .map(f => ({
        quality: f.abr ? `${f.abr}kbps` : 'unknown',
        itag: f.format_id,
        audioBitrate: f.abr || 0
      }))
      .sort((a, b) => b.audioBitrate - a.audioBitrate)
      .slice(0, 5) || [];

    res.json({
      title: info.title,
      duration: info.duration,
      thumbnail: info.thumbnail,
      videoFormats,
      audioFormats
    });

  } catch (error) {
    console.error('Error fetching video info:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to fetch video information',
      details: error.message,
      suggestion: 'Please check if the URL is valid and accessible'
    });
  }
});

// Download endpoint
app.post('/api/download', async (req, res) => {
  try {
    const { url, format, quality, outputFormat } = req.body;

    console.log('Download request:', { url, format, quality, outputFormat });

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Generate safe filename
    const safeTitle = url.split('v=')[1] || 'video';
    console.log('Downloading video ID:', safeTitle);

    let filename;
    let filePath;

    // Simplified options for yt-dlp
    const options = {
      noCheckCertificates: true,
      noWarnings: true,
      quiet: false, // Show progress
      noPart: true, // Don't use .part files
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    // Add proxy if configured
    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      options.proxy = proxyUrl;
    }

    if (outputFormat === 'mp3') {
      // Download and extract audio
      filename = `${safeTitle}.mp3`;
      filePath = path.join(downloadsDir, filename);

      options.extractAudio = true;
      options.audioFormat = 'mp3';
      options.audioQuality = quality || '192';
      options.output = filePath;
      options.format = 'bestaudio/best';

    } else {
      // Download video
      filename = `${safeTitle}.mp4`;
      filePath = path.join(downloadsDir, filename);

      if (quality) {
        // Use specific quality
        const heightMap = {
          '1080p': '1080',
          '720p': '720',
          '480p': '480',
          '360p': '360'
        };
        const height = heightMap[quality] || quality;
        options.format = `best[height<=${height}][ext=mp4]/best[height<=${height}]/best[ext=mp4]/best`;
      } else {
        options.format = 'best[ext=mp4]/best';
      }
      options.output = filePath;
    }

    console.log('Downloading to:', filePath);
    console.log('Options:', JSON.stringify(options, null, 2));

    try {
      // Execute download
      await youtubedl(url, options);
      console.log('Download completed successfully');
    } catch (dlError) {
      console.error('yt-dlp error:', dlError.message);
      throw dlError;
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('Download completed but file not found');
    }

    // Send file
    res.download(filePath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up file after download
      setTimeout(() => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }, 60000); // Delete after 1 minute
    });

  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Failed to download video' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});