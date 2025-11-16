import { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [selectedFormat, setSelectedFormat] = useState('mp4');
  const [selectedQuality, setSelectedQuality] = useState('');
  const [audioBitrate, setAudioBitrate] = useState('128');

  const handleFetchInfo = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');
    setVideoInfo(null);

    try {
      const response = await axios.post('/api/video-info', { url });
      setVideoInfo(response.data);

      // Set default quality
      if (response.data.videoFormats.length > 0) {
        setSelectedQuality(response.data.videoFormats[0].itag);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch video information');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        url,
        outputFormat: selectedFormat,
        quality: selectedFormat === 'mp3' ? audioBitrate : selectedQuality
      };

      const response = await axios.post('/api/download', payload, {
        responseType: 'blob'
      });

      // Create download link
      const downloadUrl = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = downloadUrl;

      const filename = response.headers['content-disposition']
        ? response.headers['content-disposition'].split('filename=')[1].replace(/"/g, '')
        : `video.${selectedFormat}`;

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setSuccess('Download started successfully!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to download video');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="app">
      <div className="header">
        <h1>YouTube Downloader</h1>
        <p>Download YouTube videos in MP3 or MP4 format with quality selection</p>
      </div>

      <div className="input-section">
        <div className="input-wrapper">
          <input
            type="text"
            className="url-input"
            placeholder="Paste YouTube URL here..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleFetchInfo()}
          />
          <button
            className="btn btn-primary"
            onClick={handleFetchInfo}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Fetch Info'}
          </button>
        </div>

        {error && <div className="error">{error}</div>}
        {success && <div className="success">{success}</div>}

        {loading && !videoInfo && (
          <div className="loading">
            <div className="spinner"></div>
            <p>Fetching video information...</p>
          </div>
        )}

        {videoInfo && (
          <div className="video-info">
            <div className="video-header">
              {videoInfo.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt={videoInfo.title}
                  className="video-thumbnail"
                />
              )}
              <div className="video-details">
                <h3>{videoInfo.title}</h3>
                <p>Duration: {formatDuration(videoInfo.duration)}</p>
              </div>
            </div>

            <div className="options-section">
              <div className="format-tabs">
                <button
                  className={`format-tab ${selectedFormat === 'mp4' ? 'active' : ''}`}
                  onClick={() => setSelectedFormat('mp4')}
                >
                  MP4 (Video)
                </button>
                <button
                  className={`format-tab ${selectedFormat === 'mp3' ? 'active' : ''}`}
                  onClick={() => setSelectedFormat('mp3')}
                >
                  MP3 (Audio)
                </button>
              </div>

              {selectedFormat === 'mp4' ? (
                <div className="option-group">
                  <label>Video Quality:</label>
                  <select
                    className="select"
                    value={selectedQuality}
                    onChange={(e) => setSelectedQuality(e.target.value)}
                  >
                    {videoInfo.videoFormats.map((format) => (
                      <option key={format.itag} value={format.itag}>
                        {format.quality} - {format.format}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="option-group">
                  <label>Audio Bitrate:</label>
                  <select
                    className="select"
                    value={audioBitrate}
                    onChange={(e) => setAudioBitrate(e.target.value)}
                  >
                    <option value="320">320 kbps (Highest)</option>
                    <option value="256">256 kbps</option>
                    <option value="192">192 kbps</option>
                    <option value="128">128 kbps (Standard)</option>
                    <option value="96">96 kbps</option>
                  </select>
                </div>
              )}

              <button
                className="btn btn-download"
                onClick={handleDownload}
                disabled={loading}
              >
                {loading ? 'Downloading...' : `Download ${selectedFormat.toUpperCase()}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
