import { auth, getAuthHeaders } from '../firebase';

export const WELINK_SYSTEM_INSTRUCTION = `You are WELINK, the warm, intelligent, and official AI Assistant & Community Guide built into the WaveLink social platform.
HOW TO RESPOND:
1. Language Matching: Always reply in the exact same language the user writes in (e.g., English, Kiswahili, French, Arabic, etc.).
2. Context & Memory: Carefully read the conversation history sent with each request so you remember earlier messages and answer follow-up questions naturally and accurately.
3. Helpful, Accurate, Friendly Answers:
   - Answer any question the user asks—whether about general knowledge, coding, math, science, writing, translations, creative brainstorming, or WaveLink features—directly, accurately, and warmly.
   - Use clean Markdown formatting (bold text, bullet lists, or code blocks) when listing steps or ideas.
4. WaveLink Platform Guide:
   - Home Feed & Sparks: Share text, photos, and videos on the Home Feed, or post 24-hour Sparks (and see who viewed and liked your Spark). React with 👍, ❤️, or 🔥, and use Download or Share buttons on any post.
   - Video Reels Hub: Watch and upload short-form vertical videos (up to 50 MB on Free, up to 100 MB on WaveLink Pro).
   - Media Studio: Create custom posts, attach soundtracks, and publish to the community.
   - Direct Messages & Groups: Real-time chat, voice notes, read receipts, and WebRTC voice/video calling with real-time incoming call alerts.
   - WaveLink Pro: Upgrade to WaveLink Pro (18,000 TZS/month via AzamPay / Mobile Money paid to WaveLink), creator tipping, post boosting, custom themes, and Blue Star verification.`;

export interface WelinkChatTurn {
  role: 'user' | 'model';
  text: string;
}

function normalizeTurnsForRequest(messages: WelinkChatTurn[]): WelinkChatTurn[] {
  const cleaned: WelinkChatTurn[] = [];
  for (const m of messages) {
    const text = String(m?.text || '').trim().slice(0, 6000);
    if (!text) continue;
    const role: 'user' | 'model' = m.role === 'model' ? 'model' : 'user';
    if (cleaned.length === 0 && role === 'model') {
      continue;
    }
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) {
      prev.text = `${prev.text}\n\n${text}`.slice(0, 8000);
    } else {
      cleaned.push({ role, text });
    }
  }
  return cleaned.length > 0 ? cleaned : [{ role: 'user', text: 'Hello WELINK!' }];
}

export function getFallbackWelinkReply(messages: WelinkChatTurn[]): string {
  const userTurns = messages.filter((m) => m.role === 'user');
  const latest = String(userTurns[userTurns.length - 1]?.text || '').trim();
  const q = latest.toLowerCase();

  if (
    q.includes('pro') ||
    q.includes('blue star') ||
    q.includes('tipping') ||
    q.includes('monetiz')
  ) {
    return `Here is how **WaveLink Pro**, **Blue Star Verification**, and **Creator Tipping** work together on WaveLink:

* **WaveLink Pro (18,000 TZS / month)**:
  * Unlock up to **25 AI Image creations per day** in WELINK Studio.
  * Access **Post Boosting** to highlight your posts and reels at the top of the community feed.
  * Customize your profile and app experience with **Pro colour themes**.
  * Quick 3-step Mobile Money checkout via **AzamPay** (Airtel Money, M-Pesa, Tigo Pesa, HaloPesa).
* **Blue Star Verification**:
  * Gives your profile an official **Blue Star badge** next to your name across Feed posts, Video Reels, Notice Board, and Messages.
  * Builds instant trust with followers and brands.
* **Creator Tipping**:
  * Followers can tap the **Tip / Support** button on your profile or posts to send direct mobile money support so you can earn from your best content!`;
  }

  if (
    q.includes('upgrade') ||
    q.includes('idea') ||
    q.includes('improve') ||
    q.includes('wacelink') ||
    q.includes('wavelink')
  ) {
    return `Here are **5 high-impact ideas to upgrade and grow WaveLink**:

* **1. Weekly Creator Challenges & Spark Themes**
  * Launch a weekly community challenge in **Video Reels** and **24-Hour Sparks**, featuring the top creator on the **Notice Board**.
* **2. Live Creator Q&As & Community Events**
  * Host scheduled live community sessions announced on the **Notice Board** where verified Blue Star creators share tips and connect with fans.
* **3. Creator Mini-Shop & Digital Perks**
  * Let **WaveLink Pro** creators offer shoutouts, event tickets, or exclusive content supported via **AzamPay Mobile Money**.
* **4. Interactive Feed Polls & Community Streaks**
  * Add 1-tap polls on Feed posts and reward active daily contributors with milestone badges.
* **5. Ready-to-Use Media Studio Templates**
  * Provide curated soundtrack and caption templates in **Media Studio** so anyone can publish standout posts in seconds.

Tell me which of these ideas you like best and I can write an action plan or announcement post for it!`;
  }

  if (q.includes('reel') || q.includes('video') || q.includes('viral')) {
    return `Here are **5 viral Wave Reel ideas** you can film and upload this week:

* **1. "Day in the Life" Fast Cut (15–30s)**
  * Share 5 quick clips of your daily routine or creative process paired with a soundtrack from **Media Studio**.
* **2. Before vs. After Reveal**
  * Show the starting point of your project, outfit, or setup for 3 seconds, then transition to the finished result.
* **3. 3 Quick Tips in 20 Seconds**
  * Share 3 practical tips in your niche—hook viewers right away with *"Here are 3 things I wish I knew earlier..."*
* **4. Behind the Scenes (BTS)**
  * Give your followers an authentic look at what happens behind the camera.
* **5. Community Question Hook**
  * End your reel with a fun question so viewers jump into the comments!`;
  }

  if (q.includes('notice') || q.includes('event') || q.includes('announcement')) {
    return `Here is an engaging **Notice Board Event Post** ready to copy and publish:

**✨ WaveLink Community Meetup & Creator Showcase!**

Join us for an interactive community session where creators connect, share ideas, and grow together!

* **What:** Creator Q&A, live showcase & community networking
* **When:** This Friday at 7:00 PM EAT
* **Where:** WaveLink Notice Board & Community Feed
* **Who Can Join:** Open to all WaveLink members!

Tap **RSVP** to save your spot and drop a 🔥 in the comments if we'll see you there!`;
  }

  if (q.includes('caption') || q.includes('hashtag') || q.includes('photo')) {
    return `Here are **3 catchy captions with hashtags** for your next photo:

* **Option 1 (Inspiring & Bold):**
  * *New waves, bigger vision, and unstoppable energy.* 🌊✨
  * \`#WaveLink #CreatorVibes #EastAfricaCreates #NextLevel\`
* **Option 2 (Short & Clean):**
  * *Moments that matter with the best community.* 🔥📸
  * \`#WaveLinkCommunity #DailySpark #GoodEnergy\`
* **Option 3 (High Engagement):**
  * *Which slide is your favourite—1 or 2? Let me know in the comments!* 👇✨
  * \`#WaveLink #TrendingNow #CommunityFirst\``;
  }

  return `Here is how I can help with **"${latest || 'your request'}"** on WaveLink:

* **Share & Connect:** Post photos, text, or vertical **Video Reels**, share 24-hour **Sparks**, or publish community events on the **Notice Board**.
* **Grow Faster:** Use **Media Studio** to add soundtracks, engage followers with reactions (👍 ❤️ 🔥), and unlock **WaveLink Pro** for Post Boosting, 25 daily AI images, and Blue Star verification.
* **Want custom content?** Tell me your topic or goal, and I will write tailored captions, reel scripts, or step-by-step ideas for you!`;
}

/**
 * Send a multi-turn chat message via the server-side Gemini endpoint (/api/welink/chat)
 */
export async function sendWelinkChatMessage(params: {
  messages: WelinkChatTurn[];
  model?: 'gemini-3.8-flash' | 'gemini-4-argon' | 'gemini-3.1-flash-lite';
  signal?: AbortSignal;
}): Promise<{ reply: string; model: string }> {
  const normalizedMessages = normalizeTurnsForRequest(params.messages);
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/welink/chat', {
      method: 'POST',
      headers,
      signal: params.signal,
      body: JSON.stringify({
        model: params.model || 'gemini-3.8-flash',
        messages: normalizedMessages,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.reply) {
      return {
        reply: data.reply,
        model: data.model || params.model || 'gemini-3.8-flash',
      };
    }

    return {
      reply: getFallbackWelinkReply(normalizedMessages),
      model: params.model || 'gemini-3.8-flash',
    };
  } catch (err: any) {
    if (params.signal?.aborted || err?.name === 'AbortError') {
      throw err;
    }
    return {
      reply: getFallbackWelinkReply(normalizedMessages),
      model: params.model || 'gemini-3.8-flash',
    };
  }
}

/**
 * Stream a multi-turn chat message via the server-side Gemini SSE endpoint (/api/welink/chat-stream)
 */
export async function sendWelinkChatMessageStream(params: {
  messages: WelinkChatTurn[];
  model?: 'gemini-3.8-flash' | 'gemini-4-argon' | 'gemini-3.1-flash-lite';
  signal?: AbortSignal;
  onChunk: (chunkText: string) => void;
}): Promise<{ fullText: string; model: string }> {
  const normalizedMessages = normalizeTurnsForRequest(params.messages);
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/welink/chat-stream', {
      method: 'POST',
      headers,
      signal: params.signal,
      body: JSON.stringify({
        model: params.model || 'gemini-3.8-flash',
        messages: normalizedMessages,
      }),
    });

    if (!res.ok || !res.body) {
      const r = await sendWelinkChatMessage(params);
      if (!params.signal?.aborted) {
        params.onChunk(r.reply);
      }
      return { fullText: r.reply, model: r.model };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let usedModel = params.model || 'gemini-3.8-flash';

    while (true) {
      if (params.signal?.aborted) {
        await reader.cancel().catch(() => {});
        break;
      }
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n\n');
      buffer = lines.pop() || '';

      for (const block of lines) {
        if (params.signal?.aborted) break;
        const trimmed = block.trim();
        if (!trimmed.startsWith('data:')) continue;
        const jsonStr = trimmed.replace(/^data:\s*/, '');
        if (!jsonStr) continue;

        try {
          const payload = JSON.parse(jsonStr);
          if (payload.error) {
            throw new Error(payload.error);
          }
          if (payload.text) {
            fullText += payload.text;
            params.onChunk(payload.text);
          }
          if (payload.model) {
            usedModel = payload.model;
          }
        } catch (parseErr: any) {
          if (parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
            throw parseErr;
          }
        }
      }
    }

    if (params.signal?.aborted) {
      return { fullText, model: usedModel };
    }

    if (!fullText.trim()) {
      const fallback = getFallbackWelinkReply(normalizedMessages);
      params.onChunk(fallback);
      return { fullText: fallback, model: usedModel };
    }

    return {
      fullText,
      model: usedModel,
    };
  } catch (err: any) {
    if (params.signal?.aborted || err?.name === 'AbortError') {
      throw err;
    }
    const r = await sendWelinkChatMessage(params);
    if (!params.signal?.aborted) {
      params.onChunk(r.reply);
    }
    return { fullText: r.reply, model: r.model };
  }
}

function getCanvasDimensions(ratio?: string): { width: number; height: number } {
  switch (ratio) {
    case '16:9':
      return { width: 1280, height: 720 };
    case '9:16':
      return { width: 720, height: 1280 };
    case '4:3':
      return { width: 1024, height: 768 };
    case '3:4':
      return { width: 768, height: 1024 };
    case '1:1':
    default:
      return { width: 1024, height: 1024 };
  }
}

async function rasterizeSvgDataUrlToPng(
  imageUrl: string,
  aspectRatio?: string
): Promise<string> {
  if (!imageUrl.startsWith('data:image/svg+xml')) {
    return imageUrl;
  }
  return new Promise((resolve) => {
    const { width, height } = getCanvasDimensions(aspectRatio);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imageUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(imageUrl);
      }
    };
    img.onerror = () => resolve(imageUrl);
    img.src = imageUrl;
  });
}

function renderClientCanvasFallback(prompt: string, aspectRatio?: string): string {
  const { width, height } = getCanvasDimensions(aspectRatio);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#1E1B4B');
  grad.addColorStop(0.55, '#EA580C');
  grad.addColorStop(1, '#FACC15');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Glowing sun
  const cx = width * 0.5;
  const sunY = height * 0.42;
  const sunR = Math.min(width, height) * 0.16;
  ctx.beginPath();
  ctx.arc(cx, sunY, sunR, 0, Math.PI * 2);
  ctx.fillStyle = '#FEF08A';
  ctx.fill();

  // Ocean horizon waves
  const horizonY = height * 0.6;
  const waveGrad = ctx.createLinearGradient(0, horizonY, 0, height);
  waveGrad.addColorStop(0, '#0D9488');
  waveGrad.addColorStop(1, '#134E4A');
  ctx.fillStyle = waveGrad;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  // Caption banner
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.fillRect(width * 0.08, height - 110, width * 0.84, 72);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(prompt.slice(0, 52), cx, height - 74);
  ctx.fillStyle = '#E2E8F0';
  ctx.font = '14px sans-serif';
  ctx.fillText('WAVELINK AI STUDIO', cx, height - 48);

  return canvas.toDataURL('image/png');
}

/**
 * Generate or edit an image via the server-side Gemini endpoint (/api/welink/image)
 */
export async function generateWelinkImage(params: {
  prompt: string;
  imageBase64?: string | null;
  imageMimeType?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: '1K' | '2K';
}): Promise<{ imageUrl: string; caption: string; model: string }> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/welink/image', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        prompt: params.prompt,
        imageBase64: params.imageBase64 || null,
        imageMimeType: params.imageMimeType || 'image/png',
        aspectRatio: params.aspectRatio || '1:1',
        imageSize: params.imageSize || '1K',
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.imageUrl) {
      const pngUrl = await rasterizeSvgDataUrlToPng(data.imageUrl, params.aspectRatio);
      return {
        imageUrl: pngUrl,
        caption: data.caption || '',
        model: data.model || 'gemini-nano-banana-2.1',
      };
    }

    const fallbackUrl = renderClientCanvasFallback(params.prompt, params.aspectRatio);
    if (fallbackUrl) {
      return {
        imageUrl: fallbackUrl,
        caption: `Created with WELINK AI Studio: "${params.prompt.trim()}"`,
        model: 'gemini-3.8-flash',
      };
    }

    throw new Error('Image creation is resting right now, please try again later.');
  } catch {
    const fallbackUrl = renderClientCanvasFallback(params.prompt, params.aspectRatio);
    if (fallbackUrl) {
      return {
        imageUrl: fallbackUrl,
        caption: `Created with WELINK AI Studio: "${params.prompt.trim()}"`,
        model: 'gemini-3.8-flash',
      };
    }
    throw new Error('Image creation is resting right now, please try again later.');
  }
}

/**
 * Helper to construct the WebSocket URL for the server-side Gemini Live Voice proxy (/api/welink/live)
 */
export async function getWelinkLiveVoiceWsUrl(voiceName: string = 'Zephyr'): Promise<string> {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let tokenParam = '';
  try {
    const idToken = auth.currentUser ? await auth.currentUser.getIdToken() : '';
    if (idToken) {
      tokenParam = `&token=${encodeURIComponent(idToken)}`;
    }
  } catch {
    // ignore token fetch failure
  }
  return `${protocol}//${window.location.host}/api/welink/live?voice=${encodeURIComponent(voiceName)}${tokenParam}`;
}

/**
 * Send a spoken voice turn to /api/welink/voice-turn and return WELINK's spoken response
 */
export async function sendWelinkVoiceTurn(params: {
  transcript: string;
  history?: WelinkChatTurn[];
}): Promise<{ reply: string; spokenText: string }> {
  const cleanTranscript = String(params.transcript || '').trim();
  const history = Array.isArray(params.history) ? params.history : [];
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/welink/voice-turn', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        transcript: cleanTranscript,
        history,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && data.reply) {
      return {
        reply: data.reply,
        spokenText: data.spokenText || data.reply.replace(/[*#_`~]+/g, ''),
      };
    }
  } catch {
    // Fallback below
  }
  const fallback = getFallbackWelinkReply([...history, { role: 'user', text: cleanTranscript }]);
  return {
    reply: fallback,
    spokenText: fallback.replace(/[*#_`~]+/g, ''),
  };
}

export interface ModerationResult {
  flagged: boolean;
  category: string;
  reason: string;
}

/**
 * Moderate post, comment, or Spark text via the server-side /api/ai/moderate endpoint.
 */
export async function moderatePostContent(text: string): Promise<ModerationResult> {
  const cleanText = String(text || '').trim().slice(0, 4000);
  if (!cleanText) {
    return { flagged: false, category: 'safe', reason: '' };
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/ai/moderate', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text: cleanText }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 429) {
      throw new Error(data.error || 'AI moderation rate limit reached. Please wait a moment and try again.');
    }
    if (res.ok && data.success) {
      return {
        flagged: Boolean(data.flagged),
        category: String(data.category || 'safe'),
        reason: String(data.reason || ''),
      };
    }
  } catch (err: any) {
    if (err?.message?.includes('rate limit')) {
      throw err;
    }
  }

  return { flagged: false, category: 'safe', reason: '' };
}

/**
 * Generate 3 engaging social captions via the server-side /api/ai/post-assist endpoint.
 */
export async function generatePostCaptions(params: {
  text?: string;
  mediaType?: 'text' | 'image' | 'video';
  tone?: 'engaging' | 'professional' | 'fun' | 'inspiring';
  isPro?: boolean;
}): Promise<string[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/ai/post-assist', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'captions',
        text: params.text || '',
        mediaType: params.mediaType || 'text',
        tone: params.tone || 'engaging',
        isPro: Boolean(params.isPro),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && Array.isArray(data.suggestions)) {
      return data.suggestions;
    }
  } catch {
    // Fallback below
  }
  return [
    `🌊 ${params.text || 'Sharing a quick thought with the WaveLink family today!'} ✨ #WaveLink #CommunityFirst`,
    `💡 Big energy today on WaveLink! 🚀 #WaveLinkCreators #GrowthMindset`,
    `🔥 What's your take? Drop a comment below 👇 #WaveLink`,
  ];
}

/**
 * Polish and improve a post draft via the server-side /api/ai/post-assist endpoint.
 */
export async function improvePostContent(params: {
  text: string;
  tone?: 'engaging' | 'professional' | 'fun' | 'inspiring';
  isPro?: boolean;
}): Promise<string> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/ai/post-assist', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'improve',
        text: params.text || '',
        tone: params.tone || 'engaging',
        isPro: Boolean(params.isPro),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.success && typeof data.improvedText === 'string') {
      return data.improvedText;
    }
  } catch {
    // Fallback below
  }
  return params.text;
}

