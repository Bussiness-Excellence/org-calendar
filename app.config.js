// Adds build numbers from CI on top of app.json.
// Google Play needs a higher versionCode for every upload.
module.exports = ({ config }) => {
  const versionCode = Number(process.env.ANDROID_VERSION_CODE) || config.android?.versionCode || 1;
  return {
    ...config,
    android: { ...config.android, versionCode },
    ios: { ...config.ios, buildNumber: String(versionCode) },
  };
};
