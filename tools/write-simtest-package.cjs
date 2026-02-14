const fs = require('fs');

fs.mkdirSync('.tmp/sim-tests', { recursive: true });
fs.writeFileSync('.tmp/sim-tests/package.json', '{"type":"commonjs"}\n');
