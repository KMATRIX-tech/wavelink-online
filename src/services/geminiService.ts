/**
 * WELINK AI Services (Server-Side Architecture)
 * 
 * All Gemini model interactions (chat, streaming, image generation, video creation,
 * and Live voice WebSocket bridging) run securely on the server via /api/welink/*.
 * No @google/genai SDK or API keys are bundled or exposed to the client browser.
 */

export const WELINK_SYSTEM_INSTRUCTION = `You are WELINK, the official AI Assistant and warm, encouraging community guide for WaveLink members.
Your personality & responsibilities:
- You are upbeat, supportive, creative, and deeply knowledgeable about the WaveLink community platform.
- Help members with questions about WaveLink:
  * Wave Feed: Posting updates, photos, and videos stored in Firestore, plus real-time Like, Heart, and Fire reactions.
  * Video Reels & Media Studio: Creating and uploading engaging clips with resumable progress, filters, and overlays.
  * Notice Board & Events: Posting and discovering community schedules, church gatherings, and official announcements.
  * Chat & Groups: Direct 1-on-1 and group chats with real-time read receipts (double-check indicators) and voice/video calling.
  * Monetization Hub & WaveLink Pro: Upgrading to WaveLink Pro (18,000 TZS via Airtel Money / AzamPay USSD or official Till 0787473334 — WaveLink Official Admin, or redeeming an official coupon pass), creator tipping, post boosting, and Blue Star verification.
- Assist Pro creators with brainstorming viral post ideas, reel scripts, captions, hashtags, and community event descriptions.
- Keep responses clear, well-structured, and welcoming.`;

export type WelinkChatModel = 'gemini-3.8-flash' | 'gemini-4-argon' | 'gemini-3.1-flash-lite';

export interface WelinkChatMessage {
  role: 'user' | 'model';
  text: string;
}

/**
 * Send a multi-turn chat message to WELINK via server-side Gemini API
 */
export async function sendWelinkChatMessage(params: {
  model: WelinkChatModel;
  messages: WelinkChatMessage[];
}): Promise<{ reply: string; model: string }> {
  const { model = 'gemini-3.8-flash', messages } = params;

  const response = await fetch('/api/welink/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.success) {
    throw new Error(data.error || 'WELINK encountered an error generating a response.');
  }

  return {
    reply: data.reply,
    model: data.model || model,
  };
}

/**
 * Stream a multi-turn chat response from WELINK via Server-Sent Events (SSE)
 */
export async function sendWelinkChatMessageStream(params: {
  model: WelinkChatModel;
  messages: WelinkChatMessage[];
  onChunk: (text: string) => void;
}): Promise<{ fullText: string; model: string }> {
  const { model = 'gemini-3.8-flash', messages, onChunk } = params;

  const response = await fetch('/api/welink/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status} from chat stream.`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response body is unavailable in this browser.');
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  let responseModel = model;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();

      if (payload === '[DONE]') {
        return { fullText, model: responseModel };
      }

      try {
        const parsed = JSON.parse(payload);
        if (parsed.error) {
          throw new Error(parsed.error);
        }
        if (parsed.text) {
          fullText += parsed.text;
          onChunk(parsed.text);
        }
        if (parsed.model) {
          responseModel = parsed.model;
        }
      } catch (parseErr: any) {
        if (parseErr.message && !parseErr.message.includes('Unexpected token')) {
          throw parseErr;
        }
      }
    }
  }

  return { fullText, model: responseModel };
}

/**
 * Create & Edit Images with WELINK Image Studio via server-side Gemini API
 */
export async function generateWelinkImage(params: {
  prompt: string;
  imageBase64?: string | null;
  imageMimeType?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: '1K' | '2K';
}): Promise<{ imageUrl: string; caption: string }> {
  const response = await fetch('/api/welink/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt.trim(),
      imageBase64: params.imageBase64,
      imageMimeType: params.imageMimeType || 'image/png',
      aspectRatio: params.aspectRatio || '1:1',
      imageSize: params.imageSize || '1K',
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to generate or edit image with WELINK.');
  }

  return {
    imageUrl: data.imageUrl,
    caption: data.caption || '',
  };
}

/**
 * Generate Video from Text with WELINK Studio via server-side Gemini API
 */
export async function generateWelinkVideo(params: {
  prompt: string;
  aspectRatio?: '16:9' | '9:16';
}): Promise<{ videoUrl: string; caption: string }> {
  const validAspect = params.aspectRatio === '9:16' ? '9:16' : '16:9';

  const response = await fetch('/api/welink/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: params.prompt.trim(),
      aspectRatio: validAspect,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to generate video with WELINK.');
  }

  return {
    videoUrl: data.videoUrl,
    caption: data.caption || '',
  };
}

/**
 * Returns the WebSocket URL for the server-side Gemini Live Voice API bridge
 */
export function getWelinkLiveVoiceWsUrl(): string {
  if (typeof window === 'undefined') return '';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/welink/live`;
}
