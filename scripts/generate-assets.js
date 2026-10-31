import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// 1. Generate WaveLink Icon SVG (512x512)
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0B0F19"/>
      <stop offset="50%" stop-color="#140E2D"/>
      <stop offset="100%" stop-color="#070A12"/>
    </linearGradient>
    <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#9333EA"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
    <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06B6D4"/>
      <stop offset="100%" stop-color="#8B5CF6"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="16" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background rounded squircle -->
  <rect width="512" height="512" rx="128" fill="url(#bgGrad)"/>
  
  <!-- Subtle border highlight -->
  <rect x="4" y="4" width="504" height="504" rx="124" fill="none" stroke="url(#waveGrad1)" stroke-width="6" stroke-opacity="0.5"/>

  <!-- Wave Icon Centered -->
  <g transform="translate(106, 126) scale(1.2)" filter="url(#glow)">
    <!-- Wave 1: Lower flow -->
    <path d="M10 160 C 50 120, 100 200, 150 160 C 200 120, 240 180, 240 180" 
          fill="none" stroke="url(#waveGrad2)" stroke-width="28" stroke-linecap="round"/>
    
    <!-- Wave 2: Middle prominent wave -->
    <path d="M10 100 C 50 50, 110 150, 160 100 C 200 60, 240 110, 240 110" 
          fill="none" stroke="url(#waveGrad1)" stroke-width="32" stroke-linecap="round"/>

    <!-- Wave 3: Top crest -->
    <path d="M20 40 C 60 10, 110 70, 150 40 C 190 10, 230 50, 230 50" 
          fill="none" stroke="#F472B6" stroke-width="24" stroke-linecap="round"/>

    <!-- Sparkle accent -->
    <circle cx="210" cy="20" r="10" fill="#FBBF24" />
  </g>
</svg>
`;

// 2. Generate Open Graph preview SVG (1200x630)
const ogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="ogBg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#070A12"/>
      <stop offset="45%" stop-color="#110C26"/>
      <stop offset="100%" stop-color="#05070D"/>
    </linearGradient>
    <linearGradient id="brandGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#A855F7"/>
      <stop offset="50%" stop-color="#6366F1"/>
      <stop offset="100%" stop-color="#EC4899"/>
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(30, 27, 75, 0.6)"/>
      <stop offset="100%" stop-color="rgba(15, 23, 42, 0.8)"/>
    </linearGradient>
  </defs>

  <rect width="1200" height="630" fill="url(#ogBg)"/>

  <!-- Glowing background orbs -->
  <circle cx="200" cy="150" r="260" fill="#7C3AED" opacity="0.25" filter="blur(80px)"/>
  <circle cx="1000" cy="450" r="300" fill="#EC4899" opacity="0.2" filter="blur(90px)"/>
  <circle cx="600" cy="300" r="220" fill="#06B6D4" opacity="0.15" filter="blur(70px)"/>

  <!-- Main Card Container -->
  <g transform="translate(100, 90)">
    <!-- Logo Badge -->
    <rect width="90" height="90" rx="26" fill="url(#brandGrad)"/>
    <!-- Waves in Logo -->
    <path d="M 22 45 Q 35 25, 48 45 T 72 45" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>
    <path d="M 22 62 Q 35 42, 48 62 T 72 62" fill="none" stroke="#FDE047" stroke-width="7" stroke-linecap="round"/>

    <!-- WaveLink text -->
    <text x="110" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="54" fill="#FFFFFF" letter-spacing="-1">WaveLink</text>
    <text x="350" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="20" fill="#A855F7" letter-spacing="2">AFRICA SOCIAL</text>

    <!-- Main Title -->
    <text x="0" y="180" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="46" fill="#F8FAFC">
      Connect, Share, and Discover
    </text>
    <text x="0" y="240" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="500" font-size="24" fill="#94A3B8">
      Real-Time Community Feed • Airtel Money &amp; AzamPay • Creator Monetization
    </text>

    <!-- Features Pill Badges -->
    <g transform="translate(0, 310)">
      <!-- Pill 1: Mobile Payments -->
      <rect x="0" y="0" width="280" height="56" rx="28" fill="#1E1B4B" stroke="#6366F1" stroke-width="2"/>
      <text x="30" y="35" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="18" fill="#E0E7FF">⚡ Airtel &amp; AzamPay</text>

      <!-- Pill 2: Wave Studio -->
      <rect x="305" y="0" width="270" height="56" rx="28" fill="#1E1B4B" stroke="#A855F7" stroke-width="2"/>
      <text x="335" y="35" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="18" fill="#F3E8FF">🎬 Media Studio &amp; Reels</text>

      <!-- Pill 3: Pro & Tips -->
      <rect x="600" y="0" width="280" height="56" rx="28" fill="#1E1B4B" stroke="#EC4899" stroke-width="2"/>
      <text x="630" y="35" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="18" fill="#FCE7F3">👑 Pro &amp; Creator Tips</text>
    </g>

    <!-- Domain Footer -->
    <text x="0" y="420" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="600" font-size="18" fill="#64748B">
      wavelink.app • Powered by WaveLink Social Network
    </text>
  </g>
</svg>
`;

fs.writeFileSync(path.join(publicDir, 'icon.svg'), iconSvg);
fs.writeFileSync(path.join(publicDir, 'og-image.svg'), ogSvg);

console.log('SVGs written successfully. Generating PNGs via ImageMagick...');

try {
  execSync('convert -background none public/icon.svg -resize 512x512 public/pwa-512x512.png');
  execSync('convert -background none public/icon.svg -resize 192x192 public/pwa-192x192.png');
  execSync('convert -background none public/icon.svg -resize 180x180 public/apple-touch-icon.png');
  execSync('convert -background none public/icon.svg -resize 32x32 public/favicon-32x32.png');
  execSync('convert public/og-image.svg -resize 1200x630 public/og-image.png');
  console.log('All PNG assets generated successfully!');
} catch (err) {
  console.error('Error converting SVGs with convert:', err);
}
