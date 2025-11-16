import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import ytdl from '@distube/ytdl-core';
import { HttpsProxyAgent } from 'https-proxy-agent';
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

// Configure BrightData proxy
const proxyUrl = `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
const agent = new HttpsProxyAgent(proxyUrl);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get video info endpoint
app.post('/api/video-info', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const info = await ytdl.getInfo(url, { agent });
    const formats = info.formats;

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
    console.error('Error fetching video info:', error);
    res.status(500).json({ error: 'Failed to fetch video information' });
  }
});

// Download endpoint
app.post('/api/download', async (req, res) => {
  try {
    const { url, format, quality, outputFormat } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const info = await ytdl.getInfo(url, { agent });
    const title = info.videoDetails.title.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');

    let filename;
    let filePath;

    if (outputFormat === 'mp3') {
      // Download audio and convert to MP3
      filename = `${title}.mp3`;
      filePath = path.join(downloadsDir, filename);

      const audioStream = ytdl(url, {
        quality: 'highestaudio',
        filter: 'audioonly',
        agent
      });

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
        agent
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
