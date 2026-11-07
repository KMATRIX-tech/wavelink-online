import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

import {fileURLToPath} from 'url';
import fs from 'fs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(() => {
  return {
    // Expose all safe public VITE_ prefixed environment variables to the frontend.
    // Secrets (GEMINI_API_KEY, AZAMPAY_CLIENT_SECRET, OWNER_EMAIL, OWNER_PHONE, OWNER_ACCESS_CODE) remain strictly on the server.
    envPrefix: ['VITE_'],
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'validate-frontend-env',
        buildStart() {
          try {
            const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
            let config: Record<string, string> = {};
            if (fs.existsSync(configPath)) {
              config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            }
            const required = ['projectId', 'apiKey', 'authDomain', 'appId'];
            const missing = required.filter(
              (key) => !config[key] && !process.env[`VITE_FIREBASE_${key.toUpperCase()}`]
            );
            if (missing.length > 0) {
              console.warn(
                `\n⚠️  [WaveLink Build Notice]: Missing frontend configuration parameters: ${missing.join(
                  ', '
                )}. Please check firebase-applet-config.json or frontend environment variables.\n`
              );
            } else {
              console.log('✓ [WaveLink Build]: All required frontend configuration parameters are present.');
            }
          } catch (err) {
            console.warn('[WaveLink Build Notice]: Could not verify frontend environment:', err);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
