// Builds the desktop packages. Code signing switches on automatically when the matching secrets are present
// (see SIGNING.md); without them, macOS builds are ad-hoc signed so Apple-silicon Macs do not report the
// downloaded app as "damaged", and Windows builds are unsigned.
'use strict';
const builder = require('electron-builder');
const config = JSON.parse(JSON.stringify(require('./package.json').build));
const env = process.env, has = (...k) => k.every(x => env[x] && env[x].trim());
for (const k of Object.keys(env)) if (/^(CSC_|APPLE_|AZURE_)/.test(k) && !env[k].trim()) delete env[k]; // empty CI secrets = unset

// macOS: Developer ID + notarization (Apple Developer Program), otherwise ad-hoc
if (has('CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID')) {
  delete config.mac.identity;
  Object.assign(config.mac, { hardenedRuntime: true, gatekeeperAssess: false, notarize: true });
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'true';
  console.log('macOS: Developer ID signing + notarization');
} else {
  config.mac.identity = '-';
  config.mac.hardenedRuntime = false; // only needed for notarization; with ad-hoc signatures it can block library loading
  console.log('macOS: ad-hoc signature (no Apple Developer certificate configured)');
}

// Windows: Azure Trusted Signing
if (has('AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET', 'AZURE_SIGN_ENDPOINT', 'AZURE_SIGN_ACCOUNT', 'AZURE_SIGN_PROFILE', 'AZURE_SIGN_PUBLISHER')) {
  config.win.azureSignOptions = { endpoint: env.AZURE_SIGN_ENDPOINT, codeSigningAccountName: env.AZURE_SIGN_ACCOUNT, certificateProfileName: env.AZURE_SIGN_PROFILE, publisherName: env.AZURE_SIGN_PUBLISHER };
  console.log('Windows: Azure Trusted Signing');
} else console.log('Windows: unsigned (no signing account configured)');

// Microsoft Store: MSIX/APPX package (Windows runners only). The Store re-signs it, so no certificate is needed.
// The identity comes from Partner Center (repository variables); without it a TEST package proves the build works.
if (process.platform === 'win32') {
  const real = has('APPX_IDENTITY_NAME', 'APPX_PUBLISHER', 'APPX_PUBLISHER_DISPLAY_NAME');
  config.win.target.push({ target: 'appx', arch: ['x64'] });
  config.appx = {
    applicationId: 'BabPls', displayName: 'BabPls', backgroundColor: '#312e81', languages: ['en-US', 'ar-SA'],
    identityName: real ? env.APPX_IDENTITY_NAME : 'BabPls.Test',
    publisher: real ? env.APPX_PUBLISHER : 'CN=BabPls-Test',
    publisherDisplayName: real ? env.APPX_PUBLISHER_DISPLAY_NAME : 'BabPls (test build)',
    artifactName: real ? 'BabPls-${version}-store.${ext}' : 'BabPls-${version}-store-TEST.${ext}'
  };
  console.log('Microsoft Store package: ' + (real ? 'Partner Center identity ' + env.APPX_IDENTITY_NAME : 'TEST identity (set the APPX_* repository variables for a Store-ready package)'));
}

builder.build({ config, publish: 'never' }).then(files => console.log(files.join('\n'))).catch(e => { console.error(e); process.exit(1); });
