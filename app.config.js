// Adds build numbers from CI on top of app.json.
// Google Play needs a higher versionCode for every upload.
//
// The web app is published in two places:
//   GitHub Pages  https://bussiness-excellence.github.io/org-calendar/  (needs the /org-calendar base path from app.json)
//   Vercel        served from the site root, so the base path is dropped there.
// Vercel sets VERCEL=1 during its builds.
module.exports = ({ config }) => {
  const versionCode = Number(process.env.ANDROID_VERSION_CODE) || config.android?.versionCode || 1;
  const experiments = { ...config.experiments };
  if (process.env.VERCEL) delete experiments.baseUrl;
  return {
    ...config,
    experiments,
    android: { ...config.android, versionCode },
    ios: { ...config.ios, buildNumber: String(versionCode) },
  };
};
