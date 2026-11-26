#!/usr/bin/env node
/**
 * One-time setup script to enable Firebase Authentication TOTP Multi-Factor Authentication
 * on project `formal-photon-n48x0` using Firebase Admin SDK.
 *
 * PREREQUISITE:
 * 1. Upgrade the Firebase project to "Firebase Authentication with Identity Platform" (Blaze plan)
 *    in the Firebase Console (Authentication -> Get started / Settings -> Upgrade to Identity Platform).
 * 2. Authenticate with Application Default Credentials or a Service Account JSON:
 *      export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
 *    OR run:
 *      gcloud auth application-default login --project=formal-photon-n48x0
 * 3. Run:
 *      node scripts/enable-totp-mfa.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, applicationDefault, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../firebase-applet-config.json');

let projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'formal-photon-n48x0';
if (fs.existsSync(configPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (parsed.projectId) {
      projectId = parsed.projectId;
    }
  } catch {
    // ignore parse error and use default projectId
  }
}

function resolveCredential() {
  const saPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (saPath && fs.existsSync(saPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(saPath, 'utf8'));
    return cert(serviceAccount);
  }
  return applicationDefault();
}

async function main() {
  if (!getApps().length) {
    initializeApp({
      credential: resolveCredential(),
      projectId
    });
  }

  console.log(`Enabling TOTP MFA on Firebase project: ${projectId}...`);

  const updatedConfig = await getAuth()
    .projectConfigManager()
    .updateProjectConfig({
      multiFactorConfig: {
        state: 'ENABLED',
        providerConfigs: [
          {
            state: 'ENABLED',
            totpProviderConfig: {
              adjacentIntervals: 1
            }
          }
        ]
      }
    });

  console.log('Success! Updated multiFactorConfig:');
  console.log(JSON.stringify(updatedConfig.multiFactorConfig, null, 2));
}

main().catch((err) => {
  console.error('Failed to enable TOTP MFA:', err?.message || err);
  if (err?.errorInfo) {
    console.error('Error details:', JSON.stringify(err.errorInfo, null, 2));
  }
  console.error(
    '\nEnsure the project is upgraded to Firebase Authentication with Identity Platform (Blaze plan) and valid admin credentials are set.'
  );
  process.exit(1);
});
