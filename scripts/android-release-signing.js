// Points the Android release build at the Play upload key.
// Run after `expo prebuild`. Reads ANDROID_UPLOAD_KEYSTORE (path) and
// ANDROID_UPLOAD_PASSWORD from the environment (GitHub secrets in CI).
const fs = require('fs');
const path = require('path');

const keystore = process.env.ANDROID_UPLOAD_KEYSTORE;
const password = process.env.ANDROID_UPLOAD_PASSWORD;
if (!keystore || !password) {
  console.log('No upload key configured: release stays signed with the debug key (test builds only).');
  process.exit(0);
}
const file = path.join(__dirname, '..', 'android', 'app', 'build.gradle');
let gradle = fs.readFileSync(file, 'utf8');
gradle = gradle.replace(
  /signingConfigs \{\n(\s+)debug \{/,
  (m, indent) =>
    `signingConfigs {\n${indent}release {\n${indent}    storeFile file(System.getenv("ANDROID_UPLOAD_KEYSTORE"))\n${indent}    storePassword System.getenv("ANDROID_UPLOAD_PASSWORD")\n${indent}    keyAlias "upload"\n${indent}    keyPassword System.getenv("ANDROID_UPLOAD_PASSWORD")\n${indent}}\n${indent}debug {`,
);
// the release build type: switch its signing config from debug to release
gradle = gradle.replace(/(release \{[^}]*?)signingConfig signingConfigs\.debug/, '$1signingConfig signingConfigs.release');
if (!gradle.includes('signingConfig signingConfigs.release')) {
  console.error('Could not set the release signing config; build.gradle layout changed.');
  process.exit(1);
}
fs.writeFileSync(file, gradle);
console.log('Release build will be signed with the Play upload key.');
