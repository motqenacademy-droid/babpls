// Copies the web app into desktop/app/ before packaging (run from the desktop folder).
'use strict';
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..'), dst = path.join(__dirname, 'app');
fs.rmSync(dst, { recursive: true, force: true });
for (const item of ['index.html', 'css', 'js', 'assets', 'examples', 'LICENSE']) fs.cpSync(path.join(src, item), path.join(dst, item), { recursive: true });
console.log('copied web app to', dst);
