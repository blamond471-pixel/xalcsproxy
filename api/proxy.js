// api/proxy.js - Xalcs Advanced Server-Side Proxy for Vercel  
// Modüller: express (web server), http-proxy-middleware (proxy core), cors (CORS), helmet (güvenlik), compression (gzip), morgan (logging), path (dosya)  
const express = require('express');  
const { createProxyMiddleware } = require('http-proxy-middleware');  
const cors = require('cors');  
const helmet = require('helmet');  
const compression = require('compression');  
const morgan = require('morgan');  
const path = require('path');  

const app = express();  

// Middleware'ler: Logging, sıkıştırma, güvenlik (CSP kapat)  
app.use(morgan('dev')); // Log istekleri  
app.use(compression()); // Response'ları gzip'le  
app.use(helmet({  
  contentSecurityPolicy: false, // CSP'yi devre dışı bırak (bypass için)  
  frameguard: false, // X-Frame-Options kaldır  
}));  
app.use(cors({ origin: '*' })); // Her yerden erişim  

// Statik dosyalar (client-side HTML - mevcut index.html'ini buraya koy)  
app.use(express.static(path.join(__dirname, '..', 'public'))); // Eğer public klasörün varsa  

// Proxy rotası: /proxy/:encodedUrl ile istekleri yönlendir  
app.use('/proxy/:encodedUrl*', (req, res, next) => {  
  try {  
    const encodedUrl = req.params.encodedUrl;  
    let target = Buffer.from(encodedUrl, 'base64').toString('utf-8');  

    // HTTPS otomatik ekle  
    if (!target.startsWith('http')) target = 'https://' + target;  

    console.log(`[PROXY] Hedef: ${target} | Yol: ${req.path}`);  

    // Proxy middleware (gelişmiş config)  
    const proxy = createProxyMiddleware({  
      target,  
      changeOrigin: true, // Host header'ı hedefe göre değiştir  
      pathRewrite: (p) => p.replace(/^\/proxy\/[^/]+/, ''), // /proxy/... kaldır  
      selfHandleResponse: true, // Response'u manuel yönet (manipülasyon için)  
      headers: {  
        'User-Agent': randomUserAgent(), // Rotate UA (anti-bot)  
        'Referer': target,  
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',  
        'Accept-Language': 'en-US,en;q=0.5',  
      },  
      on: {  
        proxyRes: handleProxyResponse, // Response manipüle  
        error: (err) => {  
          console.error('[PROXY HATA]', err);  
          res.status(502).send('Proxy hatası: ' + err.message);  
        },  
      },  
    });  

    proxy(req, res, next);  
  } catch (err) {  
    res.status(400).send('Geçersiz URL: ' + err.message);  
  }  
});  

// Response manipülasyonu (CSP kaldır, link rewrite)  
function handleProxyResponse(proxyRes, req, res) {  
  // Header'ları kopyala ama güvenlik olanları kaldır  
  Object.keys(proxyRes.headers).forEach((key) => {  
    res.setHeader(key, proxyRes.headers[key]);  
  });  
  delete proxyRes.headers['content-security-policy'];  
  delete proxyRes.headers['content-security-policy-report-only'];  
  delete proxyRes.headers['x-frame-options'];  
  delete proxyRes.headers['strict-transport-security'];  
  delete proxyRes.headers['x-content-type-options'];  

  if (proxyRes.headers['content-type']?.includes('text/html')) {  
    // HTML'i topla ve rewrite et  
    let body = [];  
    proxyRes.on('data', (chunk) => body.push(chunk));  
    proxyRes.on('end', () => {  
      let html = Buffer.concat(body).toString();  

      // Link/script/img/action'leri proxy üzerinden yönlendir  
      const encodedTarget = req.params.encodedUrl;  
      html = html.replace(  
        /(href|src|action|content)=["']((?!https?:\/\/|\/\/|data:|blob:|javascript:|mailto:|tel:)[^"']+)["']/gi,  
        (match, attr, relative) => {  
          return `${attr}="/proxy/${encodedTarget}${relative.startsWith('/') ? '' : '/'}${relative}"`;  
        }  
      );  

      // CSS url()'leri rewrite  
      html = html.replace(  
        /url\((['"]?)(?!https?:\/\/|\/\/|data:|blob:)([^'")]+)(['"]?)\)/gi,  
        `url($1/proxy/${encodedTarget}$2$3)`  
      );  

      // Base tag ekle (relative link fix)  
      html = html.replace(/<head>/i, `<head><base href="/proxy/${encodedTarget}/">`);  

      res.send(html);  
    });  
  } else {  
    // Diğer dosyalar (js, css, img) direkt geç  
    proxyRes.pipe(res);  
  }  
}  

// Random User-Agent (anti-detection)  
function randomUserAgent() {  
  const agents = [  
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',  
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',  
    'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',  
    // Daha fazla ekle  
  ];  
  return agents[Math.floor(Math.random() * agents.length)];  
}  

// Ana sayfa (client-side HTML'e yönlendir)  
app.get('/', (req, res) => {  
  res.sendFile(path.join(__dirname, '..', 'index.html')); // Mevcut index.html  
});  

// 404 hata yönetimi  
app.use((req, res) => {  
  res.status(404).send('Sayfa bulunamadı. / adresine dön');  
});  

module.exports = app;  