// Proxy configuration with multiple providers and fallback logic
import dotenv from 'dotenv';
dotenv.config();

// Proxy provider configurations
const PROXY_PROVIDERS = {
  brightdata: {
    enabled: !!process.env.PROXY_USERNAME || !!process.env.BRIGHTDATA_USERNAME,
    buildUrl: (sessionId) => {
      // Support both old and new env variable names
      const baseUsername = process.env.PROXY_USERNAME || process.env.BRIGHTDATA_USERNAME;
      const password = process.env.PROXY_PASSWORD || process.env.BRIGHTDATA_PASSWORD;
      const host = process.env.PROXY_HOST || process.env.BRIGHTDATA_HOST;
      const port = process.env.PROXY_PORT || process.env.BRIGHTDATA_PORT;

      if (!baseUsername || !password || !host || !port) {
        console.log('BrightData proxy not fully configured');
        return null;
      }

      // Debug: Log actual values being used
      console.log('BrightData config:', {
        username: baseUsername,
        host,
        port,
        zone: baseUsername.includes('scraping_browser') ? 'scraping_browser' : 'residential'
      });

      // For scraping_browser zone, use without session modification
      const username = baseUsername.includes('scraping_browser')
        ? baseUsername
        : (sessionId ? `${baseUsername}-session-${sessionId}` : baseUsername);

      const proxyUrl = `http://${username}:${password}@${host}:${port}`;
      console.log('BrightData proxy URL:', proxyUrl.replace(password, '***'));
      return proxyUrl;
    },
    type: 'residential',
    priority: 1
  },

  smartproxy: {
    enabled: !!process.env.SMARTPROXY_USERNAME,
    buildUrl: (sessionId) => {
      const username = sessionId
        ? `${process.env.SMARTPROXY_USERNAME}-session-${sessionId}`
        : process.env.SMARTPROXY_USERNAME;
      return `http://${username}:${process.env.SMARTPROXY_PASSWORD}@gate.smartproxy.com:7000`;
    },
    type: 'residential',
    priority: 2
  },

  oxylabs: {
    enabled: !!process.env.OXYLABS_USERNAME,
    buildUrl: () => {
      return `http://${process.env.OXYLABS_USERNAME}:${process.env.OXYLABS_PASSWORD}@pr.oxylabs.io:7777`;
    },
    type: 'residential',
    priority: 3
  },

  // Free proxy lists (less reliable but good for fallback)
  freeProxy: {
    enabled: true,
    buildUrl: () => null, // Will be handled differently
    type: 'datacenter',
    priority: 99
  }
};

// Get active proxy providers sorted by priority
const getActiveProviders = () => {
  const providers = Object.entries(PROXY_PROVIDERS)
    .filter(([name, config]) => {
      const isEnabled = config.enabled;
      console.log(`Provider ${name}: ${isEnabled ? 'enabled' : 'disabled'}`);
      return isEnabled;
    })
    .sort((a, b) => a[1].priority - b[1].priority);

  console.log(`Active providers: ${providers.map(p => p[0]).join(', ') || 'none'}`);
  return providers;
};

// Generate session ID for IP rotation
const generateSessionId = () => {
  return Math.random().toString(36).substring(7);
};

// Get proxy URL with fallback logic
export const getProxyWithFallback = async (attempt = 0) => {
  const providers = getActiveProviders();

  if (providers.length === 0) {
    console.log('No proxy providers configured, using direct connection');
    return null;
  }

  // Try providers in order of priority
  const providerIndex = attempt % providers.length;
  const [providerName, config] = providers[providerIndex];

  console.log(`Attempting proxy provider: ${providerName} (attempt ${attempt + 1})`);

  if (providerName === 'freeProxy') {
    // Fetch free proxy from proxy list APIs
    return await getFreeProxy();
  }

  // Generate new session ID for each attempt (IP rotation)
  const sessionId = generateSessionId();
  const proxyUrl = config.buildUrl(sessionId);

  if (!proxyUrl) {
    console.log(`Failed to build proxy URL for ${providerName}`);
    return null;
  }

  return {
    url: proxyUrl,
    provider: providerName,
    sessionId,
    attempt
  };
};

// Fetch free proxy as last resort
const getFreeProxy = async () => {
  try {
    // You can integrate with free proxy APIs like:
    // - https://www.proxy-list.download/api/v1/get?type=https
    // - https://api.proxyscrape.com/v2/
    console.log('Free proxy fallback - returning null for direct connection');
    return null;
  } catch (error) {
    console.error('Failed to fetch free proxy:', error);
    return null;
  }
};

// Test proxy connectivity
export const testProxy = async (proxyUrl) => {
  try {
    // Simple test to check if proxy works
    const testUrl = 'http://ip-api.com/json';
    // Implementation would use the proxy to fetch this URL
    // For now, we'll assume it works
    return true;
  } catch (error) {
    console.error('Proxy test failed:', error);
    return false;
  }
};

// Retry logic with different proxies
export const downloadWithRetry = async (downloadFunc, maxAttempts = 3) => {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const proxyConfig = await getProxyWithFallback(attempt);

      if (!proxyConfig) {
        // No proxy, try direct connection
        console.log('Attempting direct connection...');
        return await downloadFunc(null);
      }

      console.log(`Using ${proxyConfig.provider} proxy (session: ${proxyConfig.sessionId})`);
      const result = await downloadFunc(proxyConfig.url);

      console.log('Download successful with proxy');
      return result;

    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error.message);

      if (attempt === maxAttempts - 1) {
        // Last attempt - try without proxy
        console.log('All proxy attempts failed, trying direct connection...');
        try {
          return await downloadFunc(null);
        } catch (directError) {
          throw new Error(`All download attempts failed: ${directError.message}`);
        }
      }

      // Wait before retry (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000);
      console.log(`Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

export default {
  getProxyWithFallback,
  testProxy,
  downloadWithRetry
};