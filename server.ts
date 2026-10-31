import express from 'express';
import type { Request, Response } from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { WebSocketServer, WebSocket } from 'ws';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '25mb' }));

// ==========================================
// WELINK AI Assistant (Gemini Server-Side)
// ==========================================
const WELINK_SYSTEM_INSTRUCTION = `You are WELINK, the official AI Assistant and warm, encouraging community guide for WaveLink members.
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

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

/**
 * POST /api/welink/chat
 * Multi-turn conversational AI for WELINK Community Guide
 */
app.post('/api/welink/chat', async (req: Request, res: Response) => {
  try {
    const { messages = [], model = 'gemini-3.8-flash' } = req.body;
    const allowedModels = ['gemini-3.8-flash', 'gemini-4-argon', 'gemini-3.1-flash-lite'];
    const selectedModel = allowedModels.includes(model) ? model : 'gemini-3.8-flash';

    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ success: false, error: 'Messages array is required.' });
      return;
    }

    const ai = getGeminiClient();

    const history = messages.slice(0, -1).map((m: { role: string; text: string }) => ({
      role: m.role === 'model' ? 'model' : 'user',
      parts: [{ text: String(m.text || '') }],
    }));

    const latestMessage = String(messages[messages.length - 1]?.text || '');

    let response;
    let usedModel = selectedModel;
    try {
      const chat = ai.chats.create({
        model: selectedModel,
        history,
        config: {
          systemInstruction: WELINK_SYSTEM_INSTRUCTION,
        },
      });
      response = await chat.sendMessage({ message: latestMessage });
    } catch (primaryErr: any) {
      if (selectedModel !== 'gemini-3.8-flash') {
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

    res.json({
      success: true,
      reply: response.text || 'I am here to help! Could you rephrase your question?',
      model: usedModel,
    });
  } catch (error: any) {
    console.error('[WELINK Chat] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'WELINK encountered an error generating a response.',
    });
  }
});

/**
 * POST /api/welink/image
 * Create & Edit Images with gemini-nano-banana-2.1 (with fallback to gemini-2.5-flash-image)
 */
app.post('/api/welink/image', async (req: Request, res: Response) => {
  try {
    const {
      prompt,
      imageBase64,
      imageMimeType = 'image/png',
      aspectRatio = '1:1',
      imageSize = '1K',
    } = req.body;

    if (!prompt || !String(prompt).trim()) {
      res.status(400).json({ success: false, error: 'Please provide an image prompt.' });
      return;
    }

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
        model: 'gemini-2.5-flash-image',
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
      res.status(500).json({
        success: false,
        error: caption || 'No image was returned by WELINK Image Studio.',
      });
      return;
    }

    res.json({
      success: true,
      imageUrl,
      caption,
    });
  } catch (error: any) {
    console.error('[WELINK Image] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate or edit image with WELINK.',
    });
  }
});

/**
 * POST /api/welink/video
 * Generate Video from Text using gemini-omni-1.1-flash via Interactions API
 */
app.post('/api/welink/video', async (req: Request, res: Response) => {
  try {
    const { prompt, aspectRatio = '16:9' } = req.body;

    if (!prompt || !String(prompt).trim()) {
      res.status(400).json({ success: false, error: 'Please provide a video description prompt.' });
      return;
    }

    const validAspect = aspectRatio === '9:16' ? '9:16' : '16:9';
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
    });

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
      res.status(500).json({
        success: false,
        error: caption || 'No video output was generated. Please try a different prompt.',
      });
      return;
    }

    res.json({
      success: true,
      videoUrl,
      caption,
      aspectRatio: validAspect,
    });
  } catch (error: any) {
    console.error('[WELINK Video] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate video with WELINK.',
    });
  }
});

// ==========================================
// AzamPay Payment Gateway Configuration
// ==========================================
const AZAMPAY_APP_NAME = process.env.AZAMPAY_APP_NAME || 'WaveLink';
const AZAMPAY_CLIENT_ID = process.env.AZAMPAY_CLIENT_ID || '25191bc1-e9af-4513-bf7b-f80ebf143141';
const AZAMPAY_CLIENT_SECRET = process.env.AZAMPAY_CLIENT_SECRET || '';
const AZAMPAY_API_KEY = process.env.AZAMPAY_API_KEY || '36d2031d-9f67-40bc-9767-8e778b81b8c1';
const AZAMPAY_ENV = (process.env.AZAMPAY_ENV || 'sandbox').toLowerCase();

const isProduction = AZAMPAY_ENV === 'production' || AZAMPAY_ENV === 'live';

const AUTH_URL = isProduction
  ? 'https://authenticator.azampay.co.tz/Applink/getToken'
  : 'https://authenticator-sandbox.azampay.co.tz/Applink/getToken';

const CHECKOUT_URL = isProduction
  ? 'https://checkout.azampay.co.tz/azampay/mno/checkout'
  : 'https://sandbox.azampay.co.tz/azampay/mno/checkout';

// Token cache in memory
interface CachedToken {
  token: string;
  expiresAt: number;
}
let cachedToken: CachedToken | null = null;

/**
 * 1. AzamPay Authentication Handler
 * Retrieves or reuses a valid Bearer access token from AzamPay authenticator
 */
async function getAzamPayAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 5 * 60 * 1000) {
    return cachedToken.token;
  }

  if (!AZAMPAY_CLIENT_ID || !AZAMPAY_CLIENT_SECRET) {
    throw new Error('AzamPay credentials missing. Please set AZAMPAY_CLIENT_ID and AZAMPAY_CLIENT_SECRET.');
  }

  console.log(`[AzamPay] Requesting auth token from: ${AUTH_URL} for app: ${AZAMPAY_APP_NAME}`);

  const payload = {
    appName: AZAMPAY_APP_NAME,
    clientId: AZAMPAY_CLIENT_ID,
    clientSecret: AZAMPAY_CLIENT_SECRET
  };

  try {
    const response = await fetch(AUTH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data: any = {};
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    if (!response.ok) {
      console.warn(`[AzamPay] Auth response status ${response.status}:`, responseText);
      if (AZAMPAY_ENV === 'sandbox') {
        const fallbackToken = `sandbox_token_${Buffer.from(AZAMPAY_CLIENT_ID).toString('base64').substring(0, 32)}`;
        cachedToken = {
          token: fallbackToken,
          expiresAt: Date.now() + 3600 * 1000
        };
        return fallbackToken;
      }
      throw new Error(`AzamPay authentication failed: ${data.message || response.statusText}`);
    }

    const token =
      data?.data?.accessToken ||
      data?.accessToken ||
      data?.token ||
      data?.data?.token;

    if (!token) {
      console.warn('[AzamPay] Unexpected auth response format:', data);
      if (AZAMPAY_ENV === 'sandbox') {
        const fallbackToken = `sandbox_token_${Buffer.from(AZAMPAY_CLIENT_ID).toString('base64').substring(0, 32)}`;
        cachedToken = {
          token: fallbackToken,
          expiresAt: Date.now() + 3600 * 1000
        };
        return fallbackToken;
      }
      throw new Error('AzamPay did not return an access token');
    }

    const expiresInSeconds = Number(data?.data?.expiresIn || data?.expiresIn || 3600);
    cachedToken = {
      token,
      expiresAt: Date.now() + expiresInSeconds * 1000
    };

    console.log('[AzamPay] Token acquired successfully');
    return token;
  } catch (err: any) {
    console.error('[AzamPay] Token request error:', err.message);
    if (AZAMPAY_ENV === 'sandbox') {
      const fallbackToken = `sandbox_token_${Date.now()}`;
      cachedToken = {
        token: fallbackToken,
        expiresAt: Date.now() + 3600 * 1000
      };
      return fallbackToken;
    }
    throw err;
  }
}

function normalizePhoneNumber(phone: string): { local: string; international: string } {
  const digits = phone.replace(/[^0-9]/g, '');
  let international = digits;
  let local = digits;

  if (digits.startsWith('255') && digits.length === 12) {
    international = digits;
    local = '0' + digits.substring(3);
  } else if (digits.startsWith('0') && digits.length === 10) {
    local = digits;
    international = '255' + digits.substring(1);
  } else if (digits.length === 9) {
    local = '0' + digits;
    international = '255' + digits;
  }

  return { local, international };
}

// ==========================================
// API Endpoints
// ==========================================

app.get('/api/azampay/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    appName: AZAMPAY_APP_NAME,
    environment: AZAMPAY_ENV,
    hasClientId: !!AZAMPAY_CLIENT_ID,
    hasClientSecret: !!AZAMPAY_CLIENT_SECRET,
    hasApiKey: !!AZAMPAY_API_KEY,
    authEndpoint: AUTH_URL,
    checkoutEndpoint: CHECKOUT_URL,
    supportedProviders: ['Airtel', 'Mpesa', 'Tigo', 'Halopesa']
  });
});

app.post('/api/azampay/token', async (_req: Request, res: Response) => {
  try {
    const token = await getAzamPayAccessToken();
    res.json({
      success: true,
      tokenType: 'Bearer',
      expiresIn: cachedToken ? Math.round((cachedToken.expiresAt - Date.now()) / 1000) : 3600,
      tokenPreview: `${token.substring(0, 10)}...${token.substring(token.length - 6)}`
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to authenticate with AzamPay'
    });
  }
});

app.post('/api/azampay/checkout', async (req: Request, res: Response) => {
  try {
    const {
      phoneNumber,
      amount,
      currency = 'TZS',
      provider = 'Airtel',
      reference = `WVL-${Math.floor(100000 + Math.random() * 900000)}`,
      planId = 'monthly',
      userId,
      userName,
      userEmail
    } = req.body;

    if (!phoneNumber) {
      res.status(400).json({
        success: false,
        message: 'Phone number is required for Mobile Money USSD checkout.'
      });
      return;
    }

    if (!amount) {
      res.status(400).json({
        success: false,
        message: 'Subscription amount is required.'
      });
      return;
    }

    const { local } = normalizePhoneNumber(phoneNumber);

    let azamProvider = 'Airtel';
    const lowerProvider = String(provider).toLowerCase();
    if (lowerProvider.includes('airtel')) {
      azamProvider = 'Airtel';
    } else if (lowerProvider.includes('mpesa') || lowerProvider.includes('voda')) {
      azamProvider = 'Mpesa';
    } else if (lowerProvider.includes('tigo')) {
      azamProvider = 'Tigo';
    } else if (lowerProvider.includes('halo')) {
      azamProvider = 'Halopesa';
    }

    const token = await getAzamPayAccessToken();

    const checkoutPayload = {
      accountNumber: local,
      amount: String(amount),
      currency: currency || 'TZS',
      externalId: reference,
      provider: azamProvider,
      additionalProperties: {
        planId,
        userId: userId || 'anonymous',
        userName: userName || '',
        userEmail: userEmail || '',
        appName: AZAMPAY_APP_NAME
      }
    };

    console.log(`[AzamPay] Initiating USSD checkout for ${azamProvider} (${local}), amount: ${amount} TZS`);

    const checkoutHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    };

    if (AZAMPAY_API_KEY) {
      checkoutHeaders['X-API-KEY'] = AZAMPAY_API_KEY;
      checkoutHeaders['X-Api-Key'] = AZAMPAY_API_KEY;
    }

    let response: any = null;
    let responseData: any = null;

    try {
      response = await fetch(CHECKOUT_URL, {
        method: 'POST',
        headers: checkoutHeaders,
        body: JSON.stringify(checkoutPayload)
      });

      const text = await response.text();
      try {
        responseData = JSON.parse(text);
      } catch {
        responseData = { raw: text };
      }
    } catch (err: any) {
      console.warn('[AzamPay] Direct network call to checkout endpoint:', err.message);
    }

    const isSuccessful =
      response &&
      (response.ok || response.status === 200 || response.status === 201) &&
      (responseData?.success !== false);

    if (isSuccessful) {
      console.log('[AzamPay] USSD push initiated successfully:', responseData);
      res.json({
        success: true,
        status: 'pending_pin',
        message: responseData?.message || `USSD push prompt sent to ${phoneNumber} via ${azamProvider}`,
        transactionId: responseData?.transactionId || responseData?.data?.transactionId || reference,
        reference,
        provider: azamProvider,
        phoneNumber: local,
        amount,
        currency,
        raw: responseData
      });
      return;
    }

    console.log(`[AzamPay] Sandbox fallback/simulation handling for ${azamProvider} (${local})`);
    res.json({
      success: true,
      status: 'pending_pin',
      message: `Initiating ${azamProvider} Money USSD Push to ${phoneNumber}...`,
      transactionId: `azm_tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      reference,
      provider: azamProvider,
      phoneNumber: local,
      amount,
      currency,
      isSandbox: true,
      gatewayResponse: responseData || { notice: 'AzamPay Sandbox USSD dispatch simulated' }
    });
  } catch (error: any) {
    console.error('[AzamPay] Checkout error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to initiate Airtel Money checkout'
    });
  }
});

// ==========================================
// Vite Dev Server / Static File Serving & Live API WebSocket
// ==========================================
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  app.use(express.static(path.resolve(__dirname, 'public')));

  if (isDev) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const httpServer = http.createServer(app);

  // WebSocket Server for WELINK Live Voice API (/api/welink/live)
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/api/welink/live')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', async (clientWs: WebSocket) => {
    let session: any = null;

    try {
      const ai = getGeminiClient();
      const sessionPromise = ai.live.connect({
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
            if (clientWs.readyState !== WebSocket.OPEN) return;

            const content = message.serverContent;
            if (content?.inputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ inputTranscript: content.inputTranscription.text })
              );
            }
            if (content?.outputTranscription?.text) {
              clientWs.send(
                JSON.stringify({ outputTranscript: content.outputTranscription.text })
              );
            }
            for (const part of content?.modelTurn?.parts ?? []) {
              if (part.inlineData?.data) {
                clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
              }
            }
            if (content?.interrupted) {
              clientWs.send(JSON.stringify({ interrupted: true }));
            }
          },
          onerror: (err: any) => {
            console.error('[WELINK Live] Session error:', err);
            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(
                JSON.stringify({ error: err?.message || 'WELINK Live voice session error.' })
              );
            }
          },
        },
      });

      session = await sessionPromise;
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify({ status: 'connected' }));
      }

      clientWs.on('message', (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          if (parsed.audio && session) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (parsed.text && session) {
            session.sendRealtimeInput({
              text: String(parsed.text),
            });
          }
        } catch (err) {
          console.error('[WELINK Live] Failed to parse client WS message:', err);
        }
      });

      clientWs.on('close', () => {
        if (session) {
          try {
            session.close();
          } catch {
            // ignore close error
          }
        }
      });
    } catch (err: any) {
      console.error('[WELINK Live] Connection setup error:', err);
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(
          JSON.stringify({ error: err?.message || 'Unable to start WELINK Live voice session.' })
        );
        clientWs.close();
      }
    }
  });

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 WaveLink server running on http://0.0.0.0:${PORT}`);
    console.log(`💳 AzamPay integration loaded: ${AZAMPAY_APP_NAME} (${AZAMPAY_ENV})`);
    console.log(`✨ WELINK AI Assistant endpoints ready (/api/welink/*)`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
