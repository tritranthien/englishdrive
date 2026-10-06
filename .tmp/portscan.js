const net = require('net');

const host = process.argv[2] || '192.168.1.7';
const from = Number(process.argv[3] || 30000);
const to = Number(process.argv[4] || 62000);
const timeout = Number(process.argv[5] || 700);
const concurrency = Number(process.argv[6] || 1500);

const open = [];
let next = from;

function tryPort(port) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    let done = false;
    const finish = (isOpen) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(isOpen);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, host);
  });
}

async function worker() {
  while (true) {
    const port = next++;
    if (port > to) return;
    if (await tryPort(port)) {
      open.push(port);
      console.log('OPEN ' + host + ':' + port);
    }
  }
}

(async () => {
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  console.log(
    'scanned ' + (to - from + 1) + ' ports in ' + ((Date.now() - started) / 1000).toFixed(1) + 's'
  );
  console.log('open ports: ' + (open.length ? open.join(', ') : '(none)'));
})();
