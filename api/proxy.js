// api/proxy.js - Crash-proof versiyon
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

// Statik dosyalar (index.html)
app.use(express.static(path.join(__dirname, '..')));  // kök klasördeki index.html

app.use('/proxy/:encodedUrl*', (req, res, next) => {
  try {
    const encodedUrl = req.params.encodedUrl;
    if (!encodedUrl) {
      return res.status(400).send('Encoded URL eksik');
    }

    let target;
    try {
      target = Buffer.from(encodedUrl, 'base64').toString('utf-8');
    } catch (decodeErr) {
      console.error('Base64 decode hatası:', decodeErr);
      return res.status(400).send('Geçersiz base64 URL');
    }

    if (!target.startsWith('http')) {
      target = 'https://' + target;
    }

    console.log(`[PROXY] Hedef: ${target} | Path: ${req.originalUrl}`);

    const proxy = createProxyMiddleware({
      target,
      changeOrigin: true,
      pathRewrite: (p) => p.replace(/^\/proxy\/[^/]+/, ''),
      selfHandleResponse: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      on: {
        proxyRes: (proxyRes, req, res) => {
          // Güvenlik header'larını kaldır
          delete proxyRes.headers['content-security-policy'];
          delete proxyRes.headers['x-frame-options'];
          delete proxyRes.headers['strict-transport-security'];

          if (proxyRes.headers['content-type']?.includes('text/html')) {
            let body = [];
            proxyRes.on('data', chunk => body.push(chunk));
            proxyRes.on('end', () => {
              let html = Buffer.concat(body).toString();

              // Relative link rewrite
              const base = `/proxy/${encodedUrl}/`;
              html = html.replace(/<head>/i, `<head><base href="${base}">`);

              res.set(proxyRes.headers);
              res.send(html);
            });
          } else {
            proxyRes.pipe(res);
          }
        },
        error: (err, req, res) => {
          console.error('[PROXY ERROR]', err);
          res.status(502).send('Proxy bağlantı hatası: ' + err.message);
        }
      }
    });

    proxy(req, res, next);
  } catch (err) {
    console.error('[CRITICAL ERROR]', err);
    res.status(500).send('Sunucu hatası: ' + err.message);
  }
});

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// 404
app.use((req, res) => {
  res.status(404).send('Sayfa bulunamadı');
});

module.exports = app;