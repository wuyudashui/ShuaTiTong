import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(root, '..', 'capacitor.config.json');
const defaultUrl = 'https://wuyudashui.github.io/ShuaTiTong/';
const rawUrl = (process.env.SHUATITONG_APP_URL || defaultUrl).trim();

let appUrl;
try {
  appUrl = new URL(rawUrl);
} catch {
  throw new Error(`SHUATITONG_APP_URL must be an absolute HTTPS URL: ${rawUrl}`);
}

if (appUrl.protocol !== 'https:') {
  throw new Error(`SHUATITONG_APP_URL must use HTTPS: ${rawUrl}`);
}
if (appUrl.username || appUrl.password) {
  throw new Error('SHUATITONG_APP_URL must not contain credentials');
}
if (appUrl.search || appUrl.hash) {
  throw new Error('SHUATITONG_APP_URL must point to a site directory without a query or fragment');
}
// Keep relative assets and question-bank requests within the hosted site path.
if (!appUrl.pathname.endsWith('/')) appUrl.pathname += '/';

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
config.server = {
  ...(config.server || {}),
  androidScheme: 'https',
  cleartext: false,
  url: appUrl.toString(),
  // Capacitor accepts host names here; keep navigation scoped to this app host.
  allowNavigation: [appUrl.hostname],
};

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
console.log(`Configured Capacitor Android server URL: ${appUrl.toString()}`);
console.log(`Allowed navigation host: ${appUrl.hostname}`);
