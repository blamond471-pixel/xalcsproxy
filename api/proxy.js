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

// WILDCARD FIX: (:encodedUrl(.*)) şeklinde yazıldı – bu çalışır
app.use('/proxy/:encodedUrl(.*)', (req, res, next) => {
  try {
    const encoded = req.params.encodedUrl;
    if (!encoded) {
      return res.status(400).send('URL parametresi eksik');
    }

    let target = Buffer.from(encoded, 'base64').toString('utf-8');
    if (!target.startsWith('http')) target = 'https://' + target;

    console.log(`Proxy isteği: ${target}`);

    createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (p) => p.replace(/^\/proxy\/[^/]+/, ''),
      headers: { 'User-Agent': 'Mozilla/5.0' },
      onError: (err) => {
        console.error('Proxy hatası:', err);
        res.status(502).send('Proxy bağlantı sorunu');
      }
    })(req, res, next);
  } catch (err) {
    console.error('Genel hata:', err);
    res.status(500).send('Sunucu hatası: ' + err.message);
  }
});

app.use((req, res) => res.status(404).send('404 - Bulunamadı'));

module.exports = app;Bashgit add api/proxy.js