'use strict';
// Keep application/model credentials out of the browser server environment.
// Pi owns this stdio process and its process group; there is no proxy protocol.
const { browserEnvironment, MCP_PACKAGE } = require('./component');
const path = require('node:path');
const clean = { ...browserEnvironment(process.env), PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH, DO_NOT_TRACK: '1' };
for (const key of Object.keys(process.env)) if (!(key in clean)) delete process.env[key];
for (const [key, value] of Object.entries(clean)) if (value !== undefined) process.env[key] = value;
require(path.join(MCP_PACKAGE, 'cli.js'));
