// Custom production server for Next.js 16 Turbopack builds
// next start doesn't support turbopack output format, so we use custom server
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';
const dev = false;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    createServer((req, res) => {
        const parsedUrl = parse(req.url, true);
        handle(req, res, parsedUrl);
    }).listen(port, hostname, (err) => {
        if (err) throw err;
        console.log(`> GSTD Frontend ready on http://${hostname}:${port}`);
    });
});
