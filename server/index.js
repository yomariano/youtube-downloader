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
  if (process.env.PROXY_USERNAME && process.env.PROXY_HOST) {
    return `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
  }
  return null;
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
      preferFreeFormats: true
    };

    // Add proxy if configured
    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      options.proxy = proxyUrl;
      console.log('Using proxy for yt-dlp');
    } else {
      console.log('No proxy configured');
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

    const info = await youtubedl(url, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true
    });

    const title = info.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    console.log('Downloading:', title);

    let filename;
    let filePath;

    const options = {
      noCheckCertificates: true,
      noWarnings: true,
      output: path.join(downloadsDir, '%(title)s.%(ext)s')
    };

    // Add proxy if configured
    const proxyUrl = getProxyUrl();
    if (proxyUrl) {
      options.proxy = proxyUrl;
    }

    if (outputFormat === 'mp3') {
      // Download and extract audio
      filename = `${title}.mp3`;
      filePath = path.join(downloadsDir, filename);

      options.extractAudio = true;
      options.audioFormat = 'mp3';
      options.audioQuality = quality || '192';
      options.output = filePath;

    } else {
      // Download video
      filename = `${title}.mp4`;
      filePath = path.join(downloadsDir, filename);

      if (quality) {
        options.format = `best[height<=${quality}]/best`;
      } else {
        options.format = 'best';
      }
      options.mergeOutputFormat = 'mp4';
      options.output = filePath;
    }

    console.log('Downloading with options:', options);

    // Execute download
    await youtubedl(url, options);

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