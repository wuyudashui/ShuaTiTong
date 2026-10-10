import fs from 'node:fs';
import path from 'node:path';

const current = JSON.parse(fs.readFileSync('android-release.json', 'utf8'));
const identity = JSON.parse(fs.readFileSync('config/android-signing.json', 'utf8'));
for (const field of ['appId', 'dataOrigin', 'certificateSha256']) {
  if (current[field] !== identity[field]) throw new Error(`Release ${field} differs from fixed identity`);
}
if (process.argv[2] === '--previous') {
  const previous = JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
  for (const field of ['appId', 'dataOrigin', 'certificateSha256']) {
    if (previous[field] !== current[field]) throw new Error(`Previous release ${field} differs; refusing incompatible upgrade`);
  }
  if (!Number.isSafeInteger(previous.versionCode) || current.versionCode <= previous.versionCode) throw new Error('Release version must increase beyond the published version');
} else {
  const dir = process.env.SHUATITONG_ANDROID_VERIFY_DIR;
  if (!dir) throw new Error('APK verification directory is required');
  const signer = fs.readFileSync(path.join(dir, 'apk-signature.txt'), 'utf8');
  const fingerprints = [...signer.matchAll(/Signer #\d+ certificate SHA-256 digest: ([a-f0-9]+)/gi)].map(m => m[1].toLowerCase());
  if (fingerprints.length !== 1 || fingerprints[0] !== identity.certificateSha256.toLowerCase()) throw new Error('APK certificate differs from the fixed signing key');
  const pkg = fs.readFileSync(path.join(dir, 'apk-package.txt'), 'utf8');
  const actual = pkg.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
  if (!actual || actual[1] !== identity.appId || Number(actual[2]) !== current.versionCode || actual[3] !== current.versionName) throw new Error('APK package or version differs from the release configuration');
}
console.log(`Verified signed upgrade ${current.versionName} (${current.versionCode})`);
