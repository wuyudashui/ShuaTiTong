import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const script = path.resolve('scripts/configure-android-release.mjs');
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'shuatitong-signing-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'android/app'), { recursive: true });
  await fs.mkdir(path.join(root, 'config'));
  await fs.writeFile(path.join(root, 'capacitor.config.json'), JSON.stringify({appId:'com.shuatitong.app',appVersion:'1.2.0',server:{url:'https://wuyudashui.github.io/ShuaTiTong/'}}));
  await fs.writeFile(path.join(root, 'config/android-signing.json'), JSON.stringify({appId:'com.shuatitong.app',dataOrigin:'https://wuyudashui.github.io',certificateSha256:'a'.repeat(64)}));
  const template = execFileSync('tar', ['-xOf', 'node_modules/@capacitor/cli/assets/android-template.tar.gz', 'app/build.gradle'], {encoding:'utf8'});
  await fs.writeFile(path.join(root, 'android/app/build.gradle'), template.replaceAll('com.getcapacitor.app','com.shuatitong.app'));
  await fs.writeFile(path.join(root, 'release.jks'), 'test fixture');
  return root;
}
const credentials = {SHUATITONG_ANDROID_KEYSTORE_PASSWORD:'private-store-value',SHUATITONG_ANDROID_KEY_ALIAS:'shuatitong',SHUATITONG_ANDROID_KEY_PASSWORD:'private-key-value'};
function run(root, extra={}) {
  return execFileSync(process.execPath, [script], {cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{...process.env,...credentials,SHUATITONG_ANDROID_KEYSTORE_PATH:path.join(root,'release.jks'),GITHUB_RUN_NUMBER:'6',GITHUB_RUN_ATTEMPT:'1',...extra}});
}
test('signed updates use ascending Android versions, retain package and data origin, and never write passwords',async t=>{
  const root=await fixture(t);run(root);
  const first=JSON.parse(await fs.readFile(path.join(root,'android-release.json'),'utf8'));
  run(root,{GITHUB_RUN_ATTEMPT:'2'});
  const retry=JSON.parse(await fs.readFile(path.join(root,'android-release.json'),'utf8'));
  run(root,{GITHUB_RUN_NUMBER:'7'});
  const next=JSON.parse(await fs.readFile(path.join(root,'android-release.json'),'utf8'));
  assert.ok(first.versionCode>2 && retry.versionCode>first.versionCode && next.versionCode>retry.versionCode);
  assert.equal(next.appId,'com.shuatitong.app');assert.equal(next.dataOrigin,'https://wuyudashui.github.io');
  const outputs=await fs.readFile(path.join(root,'android/app/shuatitong-release.gradle'),'utf8');
  for(const secret of [credentials.SHUATITONG_ANDROID_KEYSTORE_PASSWORD,credentials.SHUATITONG_ANDROID_KEY_PASSWORD]) assert.equal(outputs.includes(secret),false);
  const gradle=await fs.readFile(path.join(root,'android/app/build.gradle'),'utf8');
  assert.equal(gradle.match(/apply from: 'shuatitong-release.gradle'/g)?.length,1,'configuration reruns are safe');
});
test('missing signing secrets fail closed instead of publishing a random debug signature',async t=>{
  const root=await fixture(t);
  assert.throws(()=>run(root,{SHUATITONG_ANDROID_KEY_PASSWORD:''}),/SHUATITONG_ANDROID_KEY_PASSWORD/);
  await assert.rejects(fs.access(path.join(root,'android-release.json')));
});
test('changing the application id or hosted origin is rejected to protect update continuity',async t=>{
  const root=await fixture(t);
  const file=path.join(root,'capacitor.config.json');
  const config=JSON.parse(await fs.readFile(file,'utf8'));
  config.appId='com.other.app';await fs.writeFile(file,JSON.stringify(config));
  assert.throws(()=>run(root),/application id/i);
  config.appId='com.shuatitong.app';config.server.url='https://other.example/ShuaTiTong/';await fs.writeFile(file,JSON.stringify(config));
  assert.throws(()=>run(root),/data origin/i);
});
test('invalid run identifiers fail instead of creating non-increasing Android versions',async t=>{
  const root=await fixture(t);
  for(const extra of [{GITHUB_RUN_NUMBER:'NaN'},{GITHUB_RUN_NUMBER:'0'},{GITHUB_RUN_ATTEMPT:'100'},{GITHUB_RUN_NUMBER:'9999999999'}])assert.throws(()=>run(root,extra),/version|run/i);
});
test('compiled APK identity and signer are checked before publication',async t=>{
  const root=await fixture(t);run(root);
  const verify=path.resolve('scripts/verify-android-release.mjs');
  const current=JSON.parse(await fs.readFile(path.join(root,'android-release.json'),'utf8'));
  const signer=path.join(root,'apk-signature.txt'), pkg=path.join(root,'apk-package.txt');
  await fs.writeFile(signer,`Signer #1 certificate SHA-256 digest: ${'a'.repeat(64)}\n`);
  await fs.writeFile(pkg,`package: name='com.shuatitong.app' versionCode='${current.versionCode}' versionName='${current.versionName}'\n`);
  const verifyRun=()=>execFileSync(process.execPath,[verify],{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe'],env:{...process.env,SHUATITONG_ANDROID_VERIFY_DIR:root}});
  assert.match(verifyRun(),/Verified/);
  await fs.writeFile(signer,`Number of signers: 1\nV2 Signer: certificate SHA-256 digest: ${'a'.repeat(64)}\n`);
  assert.match(verifyRun(),/Verified/,'recent Android build-tools report V2 Signer rather than Signer #1');
  await fs.writeFile(signer,`Signer #1 certificate SHA-256 digest: ${'b'.repeat(64)}\n`);
  assert.throws(verifyRun,/certificate/);
  await fs.writeFile(signer,`Signer #1 certificate SHA-256 digest: ${'a'.repeat(64)}\n`);
  await fs.writeFile(pkg,`package: name='com.other.app' versionCode='${current.versionCode}' versionName='${current.versionName}'\n`);
  assert.throws(verifyRun,/package/);
});
test('publishing blocks signer changes and versions older than the current rolling release',async t=>{
  const root=await fixture(t);run(root);
  const verify=path.resolve('scripts/verify-android-release.mjs');
  const file=path.join(root,'android-release.json'), previous=path.join(root,'previous.json');
  const current=JSON.parse(await fs.readFile(file,'utf8'));
  const verifyRun=()=>execFileSync(process.execPath,[verify,'--previous',previous],{cwd:root,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  await fs.writeFile(previous,JSON.stringify({...current,versionCode:current.versionCode-1}));
  assert.match(verifyRun(),/Verified/);
  await fs.writeFile(previous,JSON.stringify(current));assert.throws(verifyRun,/version/);
  await fs.writeFile(previous,JSON.stringify({...current,versionCode:current.versionCode-1,certificateSha256:'b'.repeat(64)}));assert.throws(verifyRun,/certificate/);
});
