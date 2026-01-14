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
app.use(helmet({ contentSecurityPolicy: false, frameguard: false }));
app.use(cors({ origin: '*' }));

app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ★★★ BU SATIR ÇOK ÖNEMLİ – WILDCARD DÜZELTİLDİ ★★★
app.use('/proxy/:encodedUrl(.*)', (req, res, next) => {
  try {
    const encoded = req.params.encodedUrl;
    if (!encoded) return res.status(400).send('URL eksik');

    let targetUrl;
    try {
      targetUrl = Buffer.from(encoded, 'base64').toString('utf-8');
    } catch (e) {
      return res.status(400).send('Geçersiz base64');
    }

    if (!targetUrl.match(/^https?:\/\//)) {
      targetUrl = 'https://' + targetUrl;
    }

    console.log(`Proxy → ${targetUrl}`);

    createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      pathRewrite: (p) => p.replace(/^\/proxy\/[^/]+/, ''),
      headers: { 'User-Agent': 'Mozilla/5.0' },
      onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
        res.status(502).send('Proxy hatası');
      }
    })(req, res, next);
  } catch (err) {
    res.status(500).send('Sunucu hatası: ' + err.message);
  }
});

app.use((req, res) => res.status(404).send('404'));

module.exports = app;git add api/proxy.js