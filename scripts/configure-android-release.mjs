import fs from 'node:fs';
import path from 'node:path';

const config = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
const identity = JSON.parse(fs.readFileSync('config/android-signing.json', 'utf8'));
if (config.appId !== identity.appId) throw new Error('Android application id changed; existing installations cannot be updated');
const dataOrigin = new URL(config.server.url).origin;
if (dataOrigin !== identity.dataOrigin) throw new Error('WebView data origin changed; migrate local data before changing the hosted origin');
if (!/^[a-f0-9]{64}$/i.test(identity.certificateSha256)) throw new Error('A fixed signing certificate fingerprint is required');

for (const name of ['SHUATITONG_ANDROID_KEYSTORE_PATH', 'SHUATITONG_ANDROID_KEYSTORE_PASSWORD', 'SHUATITONG_ANDROID_KEY_ALIAS', 'SHUATITONG_ANDROID_KEY_PASSWORD']) {
  if (!process.env[name]) throw new Error(`Missing ${name}; refusing an unsigned or debug release`);
}
if (!fs.existsSync(process.env.SHUATITONG_ANDROID_KEYSTORE_PATH)) throw new Error('Signing keystore file is missing');
const run = Number(process.env.GITHUB_RUN_NUMBER);
const attempt = Number(process.env.GITHUB_RUN_ATTEMPT);
if (!Number.isSafeInteger(run) || run < 1 || !Number.isSafeInteger(attempt) || attempt < 1 || attempt > 99) throw new Error('Invalid release run number or attempt');
// Retrying a run must also produce an upgrade, rather than reinstalling the same version.
const versionCode = 10000 + run * 100 + attempt;
if (versionCode > 2100000000) throw new Error('Android versionCode exceeds the supported range');
if (!/^\d+\.\d+\.\d+$/.test(config.appVersion)) throw new Error('Invalid Android version name');
const versionName = `${config.appVersion}.${run}.${attempt}`;
const gradlePath = path.join('android', 'app', 'build.gradle');
let gradle = fs.readFileSync(gradlePath, 'utf8');
if (!gradle.includes(`applicationId "${identity.appId}"`)) throw new Error('Generated Android application id does not match the fixed identity');
const include = "apply from: 'shuatitong-release.gradle'";
if (!gradle.includes(include)) gradle += `\n${include}\n`;
fs.writeFileSync(gradlePath, gradle);
fs.writeFileSync(path.join('android', 'app', 'shuatitong-release.gradle'), `// Generated release configuration. Passwords are read at build time only.
android {
    defaultConfig {
        versionCode ${versionCode}
        versionName '${versionName}'
    }
    signingConfigs {
        shuatitongRelease {
            storeFile file(System.getenv('SHUATITONG_ANDROID_KEYSTORE_PATH'))
            storePassword System.getenv('SHUATITONG_ANDROID_KEYSTORE_PASSWORD')
            keyAlias System.getenv('SHUATITONG_ANDROID_KEY_ALIAS')
            keyPassword System.getenv('SHUATITONG_ANDROID_KEY_PASSWORD')
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.shuatitongRelease
        }
    }
}
`);
fs.writeFileSync('android-release.json', `${JSON.stringify({appId:identity.appId, dataOrigin, versionCode, versionName, certificateSha256:identity.certificateSha256}, null, 2)}\n`);
console.log(`Configured signed Android ${versionName} (versionCode ${versionCode})`);
