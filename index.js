const fs = require('fs');
const url = require('url');
const path = require('path');
const http = require('http');
const http2 = require('http2');
const https = require('https');
const clor = require('clor');
const zlib = require('zlib');
const {
  log,
  mimes,
  open_browser,
  use_port,
  fileWatch
} = require('./utils');

const sendError = (res, status) => {
  res.writeHead(status);
  res.write(`${status}`);
  res.end();
  log(`${clor.red.bold(status)}`);
};

const sendFile = (res, status, file, ext, encoding = 'binary') => {
  if (['js', 'css', 'html', 'json', 'xml', 'svg'].includes(ext)) {
    res.setHeader('content-encoding', 'gzip');
    file = zlib.gzipSync(utf8(file));
    encoding = 'utf8';
  }
  res.writeHead(status, {
    'content-type': mimes(ext)
  });
  res.write(file, encoding);
  res.end();
};

const sendMessage = (res, channel, data) => {
  res.write(`event: ${channel}\nid: 0\ndata: ${data}\n`);
  res.write('\n\n');
};

const utf8 = (file) => Buffer.from(file, 'binary').toString('utf8');
const isRouteRequest = (pathname) => !~pathname.split('/').pop().indexOf('.');
const baseDoc = (pathname = '', base = path.join('/', pathname, '/')) =>
  `<!doctype html><meta charset="utf-8"/><base href="${base}"/>`;

const start = options => {
  const root = options.root || ".";
  const module = options.module || false;
  const fallback = options.fallback || module ? 'index.js' : 'index.html';
  const port = parseInt(options.port) || 8080;
  const inject = options.inject || '';
  const static = options.static || false;
  const reload = options.reload || true;
  const credentials = options.credentials || false;
  const reloadClients = [];
  const protocol = credentials ? 'https' : 'http';
  const server = credentials ?
    reload ?
    (cb) => https.createServer(credentials, cb) :
    (cb) => http2.createSecureServer(credentials, cb) :
    (cb) => http.createServer(cb);

  const livereload = reload ? `
  <script>
  const source = new EventSource('/livereload');
  const reload = () => location.reload(true);
  source.onmessage = reload;
  source.onerror = () => (source.onopen = reload);
  console.log('[servor] listening for file changes');
  </script>
  ` : '';

  const serveReload = (res) => {
    res.writeHead(200, {
      connection: 'keep-alive',
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    });
    sendMessage(res, 'connected', 'ready');
    setInterval(sendMessage, 60000, res, 'ping', 'waiting');
    reloadClients.push(res);
  };


  const serveStaticFile = (res, pathname) => {
    const uri = path.join(root, pathname);
    let ext = uri.replace(/^.*[\.\/\\]/, '').toLowerCase();
    if (!fs.existsSync(uri)) return sendError(res, 404);
    fs.readFile(uri, 'binary', (err, file) =>
      err ? sendError(res, 500) : sendFile(res, 200, file, ext)
    );
  };

  const serveRoute = (res, pathname) => {
    const index = static ?
      path.join(root, pathname, fallback) :
      path.join(root, fallback);
    //if (!fs.existsSync(index) || (pathname.endsWith('/') && pathname !== '/'))
    //  return serveDirectoryListing(res, pathname);
    fs.readFile(index, 'binary', (err, file) => {
      if (err) return sendError(res, 500);
      const status = pathname === '/' || static ? 200 : 301;
      if (module) file = `<script type='module'>${file}</script>`;
      if (static) file = baseDoc(pathname) + file;
      file = file + inject + livereload;
      sendFile(res, status, file, 'html');
    });
  };

  (async function () {
    var status = await use_port(port);
    if (status == "") {
      server((req, res) => {
        const pathname = decodeURI(url.parse(req.url).pathname);
        res.setHeader('access-control-allow-origin', '*');
        if (reload && pathname === '/livereload') return serveReload(res);
        if (!isRouteRequest(pathname)) return serveStaticFile(res, pathname);
        return serveRoute(res, pathname);
      }).listen(parseInt(port, 10), () => {
        open_browser(port);
        log(`Open ${clor.blue.bold(protocol+"://localhost:"+port)}`);
      });

      reload &&
        fileWatch(root, () => {
          while (reloadClients.length > 0)
            sendMessage(reloadClients.pop(), 'message', 'reload');
        });

      process.on('SIGINT', () => {
        while (reloadClients.length > 0) reloadClients.pop().end();
        process.exit();
      });
    } else {
      log(`Error ${clor.red.bold(status)}`);
    }
  })()
}

module.exports = {
  start: start
}