import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ytdl from '@distube/ytdl-core';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { CookieJar } from 'tough-cookie';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import ffmpeg from 'fluent-ffmpeg';

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

// Create cookie jar for ytdl-core
const cookieJar = new CookieJar();

// Configure BrightData proxy (optional)
let agent = null;
if (process.env.PROXY_USERNAME && process.env.PROXY_HOST) {
  const proxyUrl = `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
  agent = new HttpsProxyAgent(proxyUrl);
  console.log('Using BrightData proxy');
} else {
  console.log('No proxy configured, using direct connection');
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    proxy: agent ? 'enabled' : 'disabled'
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
      ...(agent && { agent }),
      requestOptions: {
        jar: cookieJar
      }
    };
    console.log('Using options:', agent ? 'with proxy' : 'without proxy');

    const info = await ytdl.getInfo(url, options);
    const formats = info.formats;

    console.log('Successfully fetched video info:', info.videoDetails.title);

    // Filter video formats
    const videoFormats = formats
      .filter(f => f.hasVideo && f.hasAudio)
      .map(f => ({
        quality: f.qualityLabel || f.quality,
        format: f.container,
        itag: f.itag,
        hasAudio: f.hasAudio,
        hasVideo: f.hasVideo
      }))
      .filter((v, i, a) => a.findIndex(t => t.quality === v.quality) === i)
      .sort((a, b) => {
        const aRes = parseInt(a.quality) || 0;
        const bRes = parseInt(b.quality) || 0;
        return bRes - aRes;
      });

    // Filter audio-only formats
    const audioFormats = formats
      .filter(f => f.hasAudio && !f.hasVideo)
      .map(f => ({
        quality: f.audioBitrate ? `${f.audioBitrate}kbps` : 'unknown',
        itag: f.itag,
        audioBitrate: f.audioBitrate || 0
      }))
      .sort((a, b) => b.audioBitrate - a.audioBitrate)
      .slice(0, 5);

    res.json({
      title: info.videoDetails.title,
      duration: info.videoDetails.lengthSeconds,
      thumbnail: info.videoDetails.thumbnails[0]?.url,
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

    const options = {
      ...(agent && { agent }),
      requestOptions: {
        jar: cookieJar
      }
    };
    const info = await ytdl.getInfo(url, options);
    const title = info.videoDetails.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');

    console.log('Downloading:', title);

    let filename;
    let filePath;

    if (outputFormat === 'mp3') {
      // Download audio and convert to MP3
      filename = `${title}.mp3`;
      filePath = path.join(downloadsDir, filename);

      const audioOptions = {
        quality: 'highestaudio',
        filter: 'audioonly',
        ...(agent && { agent }),
        requestOptions: {
          jar: cookieJar
        }
      };

      const audioStream = ytdl(url, audioOptions);

      await new Promise((resolve, reject) => {
        ffmpeg(audioStream)
          .audioBitrate(quality || 128)
          .toFormat('mp3')
          .on('end', resolve)
          .on('error', reject)
          .save(filePath);
      });

    } else {
      // Download video (MP4)
      filename = `${title}.mp4`;
      filePath = path.join(downloadsDir, filename);

      const videoStream = ytdl(url, {
        quality: quality || 'highest',
        filter: format === 'videoonly' ? 'videoonly' : 'videoandaudio',
        ...(agent && { agent }),
        requestOptions: {
          jar: cookieJar
        }
      });

      const writeStream = fs.createWriteStream(filePath);

      await new Promise((resolve, reject) => {
        videoStream.pipe(writeStream);
        videoStream.on('end', resolve);
        videoStream.on('error', reject);
        writeStream.on('error', reject);
      });
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
