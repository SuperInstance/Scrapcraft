// Local CONNECT forwarder: lets Chrome use an unauthenticated local proxy
// while the real egress proxy (which demands auth) sits upstream.
// Chrome -> 127.0.0.1:8888 (no auth) -> hatch-egress-proxy:3128 (auth injected here).
const net = require('net');
const http = require('http');

const upstream = new URL(process.env.https_proxy || process.env.http_proxy);
const AUTH = 'Basic ' + Buffer.from(decodeURIComponent(upstream.username) + ':' + decodeURIComponent(upstream.password)).toString('base64');
const UHOST = upstream.hostname, UPORT = +upstream.port;

const server = http.createServer();
server.on('connect', (req, clientSocket, head) => {
  const up = net.connect(UPORT, UHOST, () => {
    up.write(`CONNECT ${req.url} HTTP/1.1\r\nHost: ${req.url}\r\nProxy-Authorization: ${AUTH}\r\nProxy-Connection: keep-alive\r\n\r\n`);
  });
  let buf = Buffer.alloc(0), established = false;
  up.on('data', (chunk) => {
    if (established) { clientSocket.write(chunk); return; }
    buf = Buffer.concat([buf, chunk]);
    const idx = buf.indexOf('\r\n\r\n');
    if (idx === -1) return;
    const statusLine = buf.slice(0, buf.indexOf('\r\n')).toString();
    if (!/ 200 /.test(statusLine)) { clientSocket.end(); up.end(); return; }
    established = true;
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    const rest = buf.slice(idx + 4);
    if (rest.length) clientSocket.write(rest);
    if (head && head.length) up.write(head);
    clientSocket.on('data', (c) => up.write(c));
  });
  up.on('error', () => clientSocket.end());
  clientSocket.on('error', () => up.end());
});
server.listen(8888, '127.0.0.1', () => console.log('fwd proxy on 127.0.0.1:8888'));
