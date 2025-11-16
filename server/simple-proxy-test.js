import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import youtubedl from 'youtube-dl-exec';

dotenv.config();

const app = express();
const PORT = 3002; // Different port for testing

app.use(cors());
app.use(express.json());

// Direct proxy configuration - no fancy rotation
const PROXY_URL = `http://${process.env.PROXY_USERNAME}:${process.env.PROXY_PASSWORD}@${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;

console.log('Testing with proxy:', PROXY_URL.replace(process.env.PROXY_PASSWORD, '***'));

app.post('/test-proxy', async (req, res) => {
  const { url } = req.body;

  console.log('\n=== PROXY TEST ===');
  console.log('URL:', url);
  console.log('Proxy Host:', process.env.PROXY_HOST);
  console.log('Proxy Port:', process.env.PROXY_PORT);
  console.log('Username:', process.env.PROXY_USERNAME);

  try {
    // Test 1: Without proxy
    console.log('\nTest 1: WITHOUT proxy...');
    try {
      const directResult = await youtubedl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true
      });
      console.log('✅ Direct connection works!');
      console.log('Video:', directResult.title);
    } catch (e) {
      console.log('❌ Direct connection failed:', e.message);
    }

    // Test 2: With proxy
    console.log('\nTest 2: WITH proxy...');
    try {
      const proxyResult = await youtubedl(url, {
        dumpSingleJson: true,
        noCheckCertificates: true,
        noWarnings: true,
        proxy: PROXY_URL
      });
      console.log('✅ Proxy connection works!');
      console.log('Video:', proxyResult.title);
      res.json({ success: true, title: proxyResult.title });
    } catch (e) {
      console.log('❌ Proxy connection failed:', e.message);

      // Test 3: Try with different proxy format
      console.log('\nTest 3: Trying SOCKS5 format...');
      const socks5Url = PROXY_URL.replace('http://', 'socks5://');
      try {
        const socksResult = await youtubedl(url, {
          dumpSingleJson: true,
          noCheckCertificates: true,
          proxy: socks5Url
        });
        console.log('✅ SOCKS5 proxy works!');
        res.json({ success: true, title: socksResult.title, proxyType: 'socks5' });
      } catch (e2) {
        console.log('❌ SOCKS5 also failed:', e2.message);
        res.status(500).json({ error: 'All proxy attempts failed' });
      }
    }

  } catch (error) {
    console.error('Test failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy test server running on port ${PORT}`);
  console.log('Test with: POST http://localhost:3002/test-proxy');
  console.log('Body: { "url": "https://www.youtube.com/watch?v=..." }');
});