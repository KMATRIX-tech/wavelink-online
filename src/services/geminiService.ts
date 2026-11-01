import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

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

/**
 * Initializes the Gemini API client using import.meta.env.VITE_GEMINI_API_KEY
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('VITE_GEMINI_API_KEY is not configured in environment variables.');
  }
  return new GoogleGenAI({ apiKey });
}

export function hasViteGeminiApiKey(): boolean {
  return Boolean(import.meta.env.VITE_GEMINI_API_KEY && String(import.meta.env.VITE_GEMINI_API_KEY).trim());
}

/**
 * Multi-turn conversational AI for WELINK Community Guide.
 * Uses import.meta.env.VITE_GEMINI_API_KEY when set (e.g., on Netlify), with server proxy fallback.
 */
export async function sendWelinkChatMessage(params: {
  model: 'gemini-3.8-flash' | 'gemini-4-argon' | 'gemini-3.1-flash-lite';
  messages: { role: 'user' | 'model'; text: string }[];
}): Promise<{ reply: string; model: string }> {
  const { model = 'gemini-3.8-flash', messages } = params;

  if (hasViteGeminiApiKey()) {
    const ai = getGeminiClient();
    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m.text || '') }],
    }));
    const latestMessage = String(messages[messages.length - 1]?.text || '');

    let usedModel = model;
    let response;
    try {
      const chat = ai.chats.create({
        model: usedModel,
        history,
        config: {
          systemInstruction: WELINK_SYSTEM_INSTRUCTION,
        },
      });
      response = await chat.sendMessage({ message: latestMessage });
    } catch (primaryErr) {
      if (usedModel !== 'gemini-3.8-flash') {
        usedModel = 'gemini-3.8-flash';
        const fallbackChat = ai.chats.create({
          model: usedModel,
          history,
          config: {
            systemInstruction: WELINK_SYSTEM_INSTRUCTION,
          },
        });
        response = await fallbackChat.sendMessage({ message: latestMessage });
      } else {
        throw primaryErr;
      }
    }

    return {
      reply: response.text || 'I am here to help! Could you rephrase your question?',
      model: usedModel,
    };
  }

  // Fallback to server-side proxy when running in full-stack mode without client env key
  const response = await fetch('/api/welink/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'WELINK could not process that request.');
  }
  return {
    reply: data.reply,
    model: data.model || model,
  };
}

/**
 * Create & Edit Images with WELINK Image Studio
 */
export async function generateWelinkImage(params: {
  prompt: string;
  imageBase64?: string | null;
  imageMimeType?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  imageSize?: '1K' | '2K';
}): Promise<{ imageUrl: string; caption: string }> {
  const {
    prompt,
    imageBase64,
    imageMimeType = 'image/png',
    aspectRatio = '1:1',
    imageSize = '1K',
  } = params;

  if (hasViteGeminiApiKey()) {
    const ai = getGeminiClient();
    const parts: any[] = [];

    if (imageBase64) {
      const cleanBase64 = String(imageBase64).replace(/^data:[^;]+;base64,/, '');
      parts.push({
        inlineData: {
          data: cleanBase64,
          mimeType: imageMimeType,
        },
      });
    }
    parts.push({ text: String(prompt).trim() });

    let response;
    try {
      response = await ai.models.generateContent({
        model: 'gemini-nano-banana-2.1',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });
    } catch {
      response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite-image',
        contents: { parts },
        config: {
          imageConfig: {
            aspectRatio,
          },
        },
      });
    }

    let imageUrl = '';
    let caption = '';

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? 'image/png';
        imageUrl = `data:${mime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        caption += part.text;
      }
    }

    if (!imageUrl) {
      throw new Error(caption || 'No image was returned by WELINK Image Studio.');
    }

    return { imageUrl, caption };
  }

  const response = await fetch('/api/welink/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt.trim(),
      imageBase64,
      imageMimeType,
      aspectRatio,
      imageSize,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to generate image.');
  }
  return {
    imageUrl: data.imageUrl,
    caption: data.caption || '',
  };
}

/**
 * Generate Video from Text using gemini-omni-1.1-flash
 */
export async function generateWelinkVideo(params: {
  prompt: string;
  aspectRatio?: '16:9' | '9:16';
}): Promise<{ videoUrl: string; caption: string }> {
  const { prompt, aspectRatio = '16:9' } = params;
  const validAspect = aspectRatio === '9:16' ? '9:16' : '16:9';

  if (hasViteGeminiApiKey()) {
    const ai = getGeminiClient();
    const interaction = await ai.interactions.create({
      model: 'gemini-omni-1.1-flash',
      input: String(prompt).trim(),
      response_format: {
        type: 'video',
        aspect_ratio: validAspect,
        duration: '5s',
        resolution: '720p',
      },
    } as any);

    let videoUrl = '';
    let caption = '';

    for (const output of (interaction as any).outputs ?? []) {
      if (output.type === 'video' && output.data) {
        const mime = output.mime_type || 'video/mp4';
        videoUrl = `data:${mime};base64,${output.data}`;
      } else if (output.type === 'text' && output.text) {
        caption += output.text;
      }
    }

    if (!videoUrl) {
      throw new Error(caption || 'No video output was generated. Please try a different prompt.');
    }

    return { videoUrl, caption };
  }

  const response = await fetch('/api/welink/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: prompt.trim(),
      aspectRatio: validAspect,
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.error || 'Failed to generate video.');
  }
  return {
    videoUrl: data.videoUrl,
    caption: data.caption || '',
  };
}

/**
 * Connect to Gemini Live Voice API directly when VITE_GEMINI_API_KEY is available
 */
export async function connectWelinkLiveVoiceClient(callbacks: {
  onConnected: () => void;
  onAudio: (base64Pcm24k: string) => void;
  onInputTranscript: (text: string) => void;
  onOutputTranscript: (text: string) => void;
  onInterrupted: () => void;
  onError: (errMsg: string) => void;
}): Promise<{
  sendAudio: (base64Pcm16k: string) => void;
  close: () => void;
}> {
  const ai = getGeminiClient();
  const session = await ai.live.connect({
    model: 'gemini-3.8-live',
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: WELINK_SYSTEM_INSTRUCTION,
    },
    callbacks: {
      onmessage: (message: LiveServerMessage) => {
        const content = message.serverContent;
        if (content?.inputTranscription?.text) {
          callbacks.onInputTranscript(content.inputTranscription.text);
        }
        if (content?.outputTranscription?.text) {
          callbacks.onOutputTranscript(content.outputTranscription.text);
        }
        for (const part of content?.modelTurn?.parts ?? []) {
          if (part.inlineData?.data) {
            callbacks.onAudio(part.inlineData.data);
          }
        }
        if (content?.interrupted) {
          callbacks.onInterrupted();
        }
      },
      onerror: (err: any) => {
        callbacks.onError(err?.message || 'WELINK Live voice session error.');
      },
    },
  });

  callbacks.onConnected();

  return {
    sendAudio: (base64Pcm16k: string) => {
      session.sendRealtimeInput({
        audio: { data: base64Pcm16k, mimeType: 'audio/pcm;rate=16000' },
      });
    },
    close: () => {
      try {
        session.close();
      } catch {
        // ignore
      }
    },
  };
}
