import { OnlineSong } from '../types';

export type VoiceEffectType = 'none' | 'chipmunk' | 'deep' | 'robot' | 'echo';

export interface RoyaltyFreeTrack extends OnlineSong {
  bpm: number;
  mood: string;
  genre: string;
  license: 'Royalty-Free (WaveLink Studio Original)';
}

// Cache generated WAV data URLs so we only synthesize each track once per session
const wavUrlCache = new Map<string, string>();

/**
 * Generates a real playable 16-bit PCM WAV data URL for a procedural royalty-free music loop.
 * Uses pure browser math — no external copyrighted files, works offline & in Feed SongPlayerCard.
 */
export function getRoyaltyFreeTrackAudioUrl(trackId: string): string {
  const cached = wavUrlCache.get(trackId);
  if (cached) return cached;

  const sampleRate = 22050;
  const durationSeconds = 20;
  const numSamples = sampleRate * durationSeconds;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // WAV Header
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  // Musical scales (Hz) for each royalty-free track
  const presets: Record<
    string,
    { bpm: number; notes: number[]; bass: number[]; style: 'pluck' | 'pad' | 'upbeat' | 'comedy' }
  > = {
    rf_afrobeat_sun: {
      bpm: 108,
      notes: [261.63, 329.63, 392.0, 440.0, 523.25, 440.0, 392.0, 329.63],
      bass: [130.81, 146.83, 164.81, 130.81],
      style: 'upbeat'
    },
    rf_lofi_breeze: {
      bpm: 84,
      notes: [220.0, 261.63, 329.63, 392.0, 349.23, 293.66, 261.63, 246.94],
      bass: [110.0, 98.0, 87.31, 98.0],
      style: 'pad'
    },
    rf_comedy_bounce: {
      bpm: 124,
      notes: [392.0, 493.88, 587.33, 523.25, 392.0, 329.63, 440.0, 523.25],
      bass: [196.0, 146.83, 164.81, 130.81],
      style: 'comedy'
    },
    rf_creator_pop: {
      bpm: 118,
      notes: [293.66, 369.99, 440.0, 587.33, 493.88, 440.0, 369.99, 329.63],
      bass: [146.83, 185.0, 220.0, 164.81],
      style: 'upbeat'
    },
    rf_bongo_groove: {
      bpm: 102,
      notes: [246.94, 293.66, 369.99, 440.0, 392.0, 369.99, 293.66, 246.94],
      bass: [123.47, 146.83, 185.0, 146.83],
      style: 'pluck'
    },
    rf_cinematic_rise: {
      bpm: 90,
      notes: [196.0, 246.94, 293.66, 392.0, 440.0, 392.0, 293.66, 246.94],
      bass: [98.0, 123.47, 146.83, 98.0],
      style: 'pad'
    },
    rf_synth_wave: {
      bpm: 120,
      notes: [329.63, 392.0, 493.88, 659.25, 587.33, 493.88, 392.0, 329.63],
      bass: [164.81, 130.81, 146.83, 123.47],
      style: 'upbeat'
    },
    rf_island_marimba: {
      bpm: 112,
      notes: [349.23, 440.0, 523.25, 698.46, 587.33, 523.25, 440.0, 349.23],
      bass: [174.61, 130.81, 146.83, 174.61],
      style: 'pluck'
    }
  };

  const cfg = presets[trackId] || presets.rf_afrobeat_sun;
  const beatDuration = 60 / cfg.bpm;
  const eighthNote = beatDuration / 2;

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const stepIndex = Math.floor(t / eighthNote);
    const stepPos = (t % eighthNote) / eighthNote;

    const noteFreq = cfg.notes[stepIndex % cfg.notes.length];
    const bassFreq = cfg.bass[Math.floor(stepIndex / 4) % cfg.bass.length];

    // Envelope
    const env =
      cfg.style === 'pad'
        ? Math.sin(stepPos * Math.PI) * 0.65
        : Math.exp(-stepPos * (cfg.style === 'comedy' ? 6.5 : 4.2));

    // Lead melody
    const lead =
      Math.sin(2 * Math.PI * noteFreq * t) * 0.35 +
      Math.sin(2 * Math.PI * noteFreq * 2 * t) * 0.12;

    // Warm sub-bass
    const bassEnv = Math.exp(-((t % beatDuration) / beatDuration) * 2.5);
    const bass = Math.sin(2 * Math.PI * bassFreq * t) * 0.32 * bassEnv;

    // Soft rhythmic kick/hat pulse
    const beatPos = (t % beatDuration) / beatDuration;
    const kick = beatPos < 0.12 ? Math.sin(2 * Math.PI * (110 - beatPos * 600) * t) * 0.25 : 0;

    const sample = Math.max(-0.95, Math.min(0.95, lead * env + bass + kick));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  const dataUrl = `data:audio/wav;base64,${btoa(binary)}`;
  wavUrlCache.set(trackId, dataUrl);
  return dataUrl;
}

export const ROYALTY_FREE_LIBRARY: Omit<RoyaltyFreeTrack, 'previewUrl'>[] = [
  {
    trackId: 'rf_afrobeat_sun',
    trackName: 'Dar es Salaam Sunset Groove',
    artistName: 'WaveLink Studio Originals',
    collectionName: 'Royalty-Free Creator Beats',
    artworkUrl100: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=200&auto=format&fit=crop&q=80',
    bpm: 108,
    mood: 'Upbeat & Sunny',
    genre: 'Afro-Fusion',
    license: 'Royalty-Free (WaveLink Studio Original)'
  },
  {
    trackId: 'rf_lofi_breeze',
    trackName: 'Ocean Breeze Lo-Fi',
    artistName: 'WaveLink Studio Originals',
    collectionName: 'Chill Study & Vlog Safe',
    artworkUrl100: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=200&auto=format&fit=crop&q=80',
    bpm: 84,
    mood: 'Chill & Aesthetic',
    genre: 'Lo-Fi Beats',
    license: 'Royalty-Free (WaveLink Studio Original)'
  },
  {
    trackId: 'rf_comedy_bounce',
    trackName: 'Quirky Skit & Comedy Pluck',
    artistName: 'WaveLink Studio Originals',
    collectionName: 'Comedy & Sketch Sounds',
    artworkUrl100: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=200&auto=format&fit=crop&q=80',
    bpm: 124,
    mood: 'Funny & Playful',
    genre: 'Comedy Skit',
    license: 'Royalty-Free (WaveLink Studio Original)'
  },
  {
    trackId: 'rf_creator_pop',
    trackName: 'Golden Hour Vlog Pop',
    artistName: 'WaveLink Studio Originals',
    collectionName: 'Creator Safe Pop',
    artworkUrl100: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=200&auto=format&fit=crop&q=80',
    bpm: 118,
    mood: 'Bright & Energetic',
    genre: 'Indie Pop',
    license: 'Royalty-Free (WaveLink Studio Original)'
  },
  {
    trackId: 'rf_bongo_groove',
    trackName: 'Zanzibar Acoustic Pluck',
    artistName: 'WaveLink Studio Originals',
    collectionName: 'East Africa Instrumental',
    artworkUrl100: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=200&auto=format&fit=crop&q=80',
    bpm: 102,
    mood: 'Warm & Smooth',
    genre: 'Acoustic Groove',
    license: 'Royalty-Free (WaveLink Studio Original)'
  },
  {
    trackId: 'rf_cinematic_rise',
    trackName: 'Storyteller Ambient Horizon',
    artistName: 'WaveLink Studio Originals',
    collectionName: 'Cinematic Scores',
    artworkUrl100: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=200&auto=format&fit=crop&q=80',
    bpm: 90,
    mood: 'Inspiring',
    genre: 'Cinematic',
    license: 'Royalty-Free (WaveLink Studio Original)'
  },
  {
    trackId: 'rf_synth_wave',
    trackName: 'Neon Night Drive',
    artistName: 'WaveLink Studio Originals',
    collectionName: 'Electronic Safe Tracks',
    artworkUrl100: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=200&auto=format&fit=crop&q=80',
    bpm: 120,
    mood: 'Hype & Cyber',
    genre: 'Synthwave',
    license: 'Royalty-Free (WaveLink Studio Original)'
  },
  {
    trackId: 'rf_island_marimba',
    trackName: 'Coco Beach Marimba',
    artistName: 'WaveLink Studio Originals',
    collectionName: 'Tropical & Travel',
    artworkUrl100: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=200&auto=format&fit=crop&q=80',
    bpm: 112,
    mood: 'Happy & Tropical',
    genre: 'Tropical',
    license: 'Royalty-Free (WaveLink Studio Original)'
  }
];

export function getHydratedRoyaltyFreeTracks(): RoyaltyFreeTrack[] {
  return ROYALTY_FREE_LIBRARY.map((item) => ({
    ...item,
    previewUrl: getRoyaltyFreeTrackAudioUrl(String(item.trackId))
  }));
}

/**
 * Plays an audio URL with a chosen fun voice effect using the browser's Web Audio API.
 */
export async function playAudioWithVoiceEffect(
  audioUrl: string,
  effect: VoiceEffectType,
  volume: number = 100
): Promise<{ stop: () => void }> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const res = await fetch(audioUrl);
  const arrayBuffer = await res.arrayBuffer();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  const source = ctx.createBufferSource();
  source.buffer = audioBuffer;

  const gainNode = ctx.createGain();
  gainNode.gain.value = Math.max(0, Math.min(1.5, volume / 100));

  if (effect === 'chipmunk') {
    source.playbackRate.value = 1.48;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highshelf';
    filter.frequency.value = 1200;
    filter.gain.value = 6;
    source.connect(filter);
    filter.connect(gainNode);
  } else if (effect === 'deep') {
    source.playbackRate.value = 0.72;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowshelf';
    filter.frequency.value = 320;
    filter.gain.value = 8;
    source.connect(filter);
    filter.connect(gainNode);
  } else if (effect === 'robot') {
    source.playbackRate.value = 1.0;
    const osc = ctx.createOscillator();
    const ringGain = ctx.createGain();
    osc.frequency.value = 55;
    osc.type = 'sawtooth';
    osc.connect(ringGain.gain);
    source.connect(ringGain);
    ringGain.connect(gainNode);
    osc.start();
    source.onended = () => {
      try {
        osc.stop();
      } catch {
        // ignore
      }
    };
  } else if (effect === 'echo') {
    const delay = ctx.createDelay();
    delay.delayTime.value = 0.22;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.42;
    delay.connect(feedback);
    feedback.connect(delay);
    source.connect(gainNode);
    source.connect(delay);
    delay.connect(gainNode);
  } else {
    source.connect(gainNode);
  }

  gainNode.connect(ctx.destination);
  source.start(0);

  return {
    stop: () => {
      try {
        source.stop();
        ctx.close();
      } catch {
        // ignore
      }
    }
  };
}
