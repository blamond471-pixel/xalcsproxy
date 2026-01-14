// api/proxy.js - Basitleştirilmiş, crash-proof Vercel versiyonu (selfHandleResponse kaldırıldı)
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');

const app = express();

app.use(morgan('dev'));
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  frameguard: false
}));
app.use(cors({ origin: '*' }));

app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Proxy rotası - wildcard düzeltilmiş hali
app.use('/proxy/:encodedUrl(.*)', (req, res, next) => {
  try {
    const encoded = req.params.encodedUrl;
    if (!encoded) return res.status(400).send('URL eksik');

    let targetUrl = Buffer.from(encoded, 'base64').toString('utf-8');
    if (!targetUrl.startsWith('http')) targetUrl = 'https://' + targetUrl;

    console.log(`[PROXY] ${req.method} ${req.originalUrl} → ${targetUrl}`);

    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      pathRewrite: (p) => p.replace(/^\/proxy\/[^/]+/, ''),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
      },
      onError: (err, req, res) => {
        console.error('Proxy error:', err);
        res.status(502).send('Proxy bağlantı hatası: ' + (err.message || 'Bilinmeyen'));
      }
    })(req, res, next);
  } catch (err) {
    console.error('Critical:', err);
    res.status(500).send('Sunucu hatası: ' + (err.message || 'Bilinmeyen'));
  }
});

app.use((req, res) => {
  res.status(404).send('404 - Bulunamadı');
});

module.exports = app;