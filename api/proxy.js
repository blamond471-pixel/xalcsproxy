// api/proxy.js - Düzeltilmiş Vercel Serverless Proxy (wildcard fix)
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
  frameguard: false,
  referrerPolicy: { policy: 'no-referrer' }
}));
app.use(cors({ origin: '*' }));

// Statik dosyalar (index.html kök klasörde)
app.use(express.static(path.join(__dirname, '..')));

// Ana sayfa
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Proxy rotası - WILDCARD FIX: :encodedUrl(.*)
app.use('/proxy/:encodedUrl(.*)', async (req, res) => {
  try {
    const encoded = req.params.encodedUrl;
    if (!encoded) {
      return res.status(400).send('URL eksik. Lütfen bir adres girin.');
    }

    let targetUrl;
    try {
      targetUrl = Buffer.from(encoded, 'base64').toString('utf-8');
    } catch (e) {
      console.error('Base64 decode hatası:', e);
      return res.status(400).send('Geçersiz URL (base64 decode edilemedi).');
    }

    if (!targetUrl.startsWith('http')) {
      targetUrl = 'https://' + targetUrl;
    }

    console.log(`[PROXY] İstek: ${req.method} ${req.originalUrl} → Hedef: ${targetUrl}`);

    const proxy = createProxyMiddleware({
      target: targetUrl,
      changeOrigin: true,
      pathRewrite: (p) => p.replace(/^\/proxy\/[^/]+/, ''),
      selfHandleResponse: true,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      on: {
        proxyRes: (proxyRes, req, res) => {
          // Güvenlik header'larını temizle
          ['content-security-policy', 'x-frame-options', 'strict-transport-security', 'x-content-type-options'].forEach(h => {
            delete proxyRes.headers[h];
          });

          res.set(proxyRes.headers);

          if (proxyRes.headers['content-type']?.includes('text/html')) {
            let body = [];
            proxyRes.on('data', chunk => body.push(chunk));
            proxyRes.on('end', () => {
              let html = Buffer.concat(body).toString('utf8');

              // Base tag + relative link fix
              const proxyBase = `/proxy/${encoded}/`;
              html = html.replace(/<head[^>]*>/i, `<head><base href="${proxyBase}">`);

              res.send(html);
            });
          } else {
            proxyRes.pipe(res);
          }
        },
        error: (err, req, res) => {
          console.error('[Proxy Error]', err.message);
          res.status(502).send(`Proxy hatası: ${err.message}`);
        }
      }
    });

    proxy(req, res);
  } catch (err) {
    console.error('[Critical Error]', err.stack);
    res.status(500).send(`Sunucu hatası: ${err.message}`);
  }
});

// 404 catch-all
app.use((req, res) => {
  res.status(404).send('404 - Bulunamadı. Ana sayfaya dön: <a href="/">Ana Sayfa</a>');
});

module.exports = app;