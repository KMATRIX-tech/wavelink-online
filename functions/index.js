'use strict';

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp, getApps, getApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { getAuth } = require('firebase-admin/auth');

setGlobalOptions({
  region: 'europe-west2',
  maxInstances: 20
});

if (!getApps().length) {
  initializeApp();
}

// Target the exact named Firestore database provisioned for WaveLink
const FIRESTORE_DATABASE_ID =
  process.env.FIRESTORE_DATABASE_ID ||
  'ai-studio-remixremixwaveli-0bcdbee7-e3d1-46ba-ab1a-3448613d34ac';

function getDb() {
  return FIRESTORE_DATABASE_ID && FIRESTORE_DATABASE_ID !== '(default)'
    ? getFirestore(getApp(), FIRESTORE_DATABASE_ID)
    : getFirestore(getApp());
}

const MAX_NOTIFICATIONS_PER_HOUR = 20;
const FOLLOWED_POST_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour per author per recipient
const LIKE_DEDUPE_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes per (postId, actorId)
const CALL_RING_TIMEOUT_MS = 30 * 1000;

const DEFAULT_SETTINGS = {
  masterEnabled: true,
  messages: true,
  calls: true,
  followers: true,
  likesAndComments: true,
  reactions: true,
  replies: true,
  followedPosts: true,
  soundAndVibration: true,
  showMessagePreviews: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  timezoneOffsetMinutes: -180
};

function sanitizeHttpsUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > 500) return '';
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return '';
  if (!trimmed.startsWith('https://')) return '';
  return trimmed;
}

function cleanSnippet(text, maxLen = 80) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > maxLen ? `${clean.slice(0, maxLen).trim()}...` : clean;
}

function isWithinQuietHours(settings) {
  if (!settings || !settings.quietHoursEnabled) return false;
  const parseHhMm = (val) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(val || '').trim());
    if (!m) return null;
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  };
  const startMins = parseHhMm(settings.quietHoursStart);
  const endMins = parseHhMm(settings.quietHoursEnd);
  if (startMins === null || endMins === null || startMins === endMins) return false;

  const offsetMinutes =
    typeof settings.timezoneOffsetMinutes === 'number' ? settings.timezoneOffsetMinutes : -180;
  const localDate = new Date(Date.now() - offsetMinutes * 60 * 1000);
  const currentMins = localDate.getUTCHours() * 60 + localDate.getUTCMinutes();

  if (startMins < endMins) {
    return currentMins >= startMins && currentMins < endMins;
  }
  return currentMins >= startMins || currentMins < endMins;
}

function isCategoryEnabled(category, settings) {
  if (!settings || settings.masterEnabled === false) return false;
  switch (category) {
    case 'message':
      return settings.messages !== false;
    case 'call':
    case 'incoming_call':
    case 'missed_call':
      return settings.calls !== false;
    case 'follow':
      return settings.followers !== false;
    case 'post_like':
      return settings.likesAndComments !== false && settings.reactions !== false;
    case 'post_comment':
      return settings.likesAndComments !== false && settings.replies !== false;
    case 'followed_post':
      return settings.followedPosts !== false;
    case 'test':
      return true;
    default:
      return true;
  }
}

async function consumeHourlyPushQuota(db, recipientId) {
  const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));
  const rateRef = db.doc(`users/${recipientId}/privatePushMeta/rateLimit`);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef);
    const data = snap.exists ? snap.data() : null;
    const prevCount = data && data.hourBucket === hourBucket ? Number(data.count || 0) : 0;
    if (prevCount >= MAX_NOTIFICATIONS_PER_HOUR) {
      return false;
    }
    tx.set(
      rateRef,
      {
        hourBucket,
        count: prevCount + 1,
        updatedAt: new Date().toISOString()
      },
      { merge: true }
    );
    return true;
  });
}

async function getUserNotificationSettings(db, recipientId, userData) {
  let subData = {};
  try {
    const snap = await db.doc(`users/${recipientId}/settings/notifications`).get();
    if (snap.exists) {
      subData = snap.data() || {};
    }
  } catch {
    // ignore subcollection read errors
  }
  return {
    ...DEFAULT_SETTINGS,
    ...(userData && userData.notificationSettings ? userData.notificationSettings : {}),
    ...subData
  };
}

async function collectUserTokens(db, recipientId) {
  const tokenMap = new Map(); // token -> { source: 'sub', docId: string }

  try {
    const subSnap = await db.collection(`users/${recipientId}/fcmTokens`).get();
    subSnap.forEach((docSnap) => {
      const d = docSnap.data();
      const tok =
        d && typeof d.token === 'string' && d.token.trim()
          ? d.token.trim()
          : docSnap.id;
      if (tok && !tok.startsWith('fcm_web_') && tok.length <= 1024) {
        tokenMap.set(tok, { source: 'sub', docId: docSnap.id });
      }
    });
  } catch {
    // ignore subcollection read errors
  }

  return tokenMap;
}

async function cleanupInvalidTokens(db, recipientId, _userData, tokenMap, invalidTokens) {
  if (!invalidTokens.length) return;

  // Clean users/{uid}/fcmTokens subcollection docs
  const deletes = [];
  for (const badTok of invalidTokens) {
    const meta = tokenMap.get(badTok);
    const docId = meta && meta.docId ? meta.docId : badTok;
    if (docId) {
      deletes.push(db.doc(`users/${recipientId}/fcmTokens/${docId}`).delete().catch(() => {}));
    }
  }
  if (deletes.length) {
    await Promise.all(deletes);
  }
}

async function sendPushToUser(db, params) {
  const {
    recipientId,
    category,
    title,
    body,
    data = {},
    iconUrl = '',
    imageUrl = '',
    highPriority = false,
    bypassRateAndSettings = false
  } = params;

  if (!recipientId) return { sent: false, reason: 'missing_recipient' };

  const userSnap = await db.doc(`users/${recipientId}`).get();
  if (!userSnap.exists) return { sent: false, reason: 'user_not_found' };
  const userData = userSnap.data() || {};
  if (userData.isBanned || userData.isDuplicateDisabled) {
    return { sent: false, reason: 'user_inactive' };
  }

  const settings = await getUserNotificationSettings(db, recipientId, userData);

  if (!bypassRateAndSettings) {
    if (!isCategoryEnabled(category, settings)) {
      return { sent: false, reason: `disabled_${category}` };
    }
    if (isWithinQuietHours(settings)) {
      return { sent: false, reason: 'quiet_hours' };
    }
    const withinQuota = await consumeHourlyPushQuota(db, recipientId);
    if (!withinQuota) {
      return { sent: false, reason: 'hourly_cap_reached' };
    }
  }

  const tokenMap = await collectUserTokens(db, recipientId);
  const tokens = Array.from(tokenMap.keys());
  if (!tokens.length) {
    return { sent: false, reason: 'no_tokens' };
  }

  const safeIcon = sanitizeHttpsUrl(iconUrl) || '/pwa-192x192.png';
  const safeImage = sanitizeHttpsUrl(imageUrl);
  const isSilent = settings.soundAndVibration === false;

  // Use data-only payload so firebase-messaging-sw.js renders rich notifications cleanly
  // with zero duplicates, Answer/Decline call actions, silent dismissal, and deep links.
  const stringData = {
    type: String(category),
    title: String(title || 'WaveLink').slice(0, 120),
    body: String(body || '').slice(0, 240),
    icon: safeIcon,
    ...(safeImage ? { image: safeImage } : {}),
    silent: isSilent ? 'true' : 'false',
    soundAndVibration: isSilent ? 'false' : 'true'
  };

  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && v !== null) {
      stringData[k] = String(v).slice(0, 300);
    }
  }

  const message = {
    tokens,
    data: stringData,
    webpush: {
      headers: {
        Urgency: highPriority ? 'high' : 'normal',
        TTL: highPriority ? '35' : '86400'
      },
      fcmOptions: {
        link: stringData.url || '/'
      }
    }
  };

  const result = await getMessaging().sendEachForMulticast(message);
  const invalidTokens = [];

  result.responses.forEach((resp, idx) => {
    if (!resp.success && resp.error) {
      const code = resp.error.code || '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token' ||
        code === 'messaging/invalid-argument'
      ) {
        invalidTokens.push(tokens[idx]);
      }
    }
  });

  if (invalidTokens.length) {
    await cleanupInvalidTokens(db, recipientId, userData, tokenMap, invalidTokens);
  }

  return {
    sent: result.successCount > 0,
    successCount: result.successCount,
    failureCount: result.failureCount,
    invalidRemoved: invalidTokens.length
  };
}

// ---------------------------------------------------------------------------
// 1. DIRECT MESSAGES & GROUP MESSAGES
// ---------------------------------------------------------------------------
async function handleChatMessageCreated(channelId, messageData, isGroup) {
  if (!messageData || messageData.isDeleted || messageData.isSystem) return;
  const senderId = String(messageData.senderId || '').trim();
  if (!senderId) return;

  const db = getDb();
  let recipientIds = [];
  let channelTitle = '';
  let mutedByMap = {};

  if (isGroup) {
    const groupSnap = await db.doc(`groups/${channelId}`).get();
    if (!groupSnap.exists) return;
    const gData = groupSnap.data() || {};
    channelTitle = String(gData.name || 'Group Chat').trim();
    mutedByMap = gData.mutedBy || {};
    recipientIds = Array.isArray(gData.memberIds) ? gData.memberIds : [];
  } else {
    if (channelId === 'official_updates') return;
    const chanSnap = await db.doc(`channels/${channelId}`).get();
    const cData = chanSnap.exists ? chanSnap.data() || {} : {};
    mutedByMap = cData.mutedBy || {};

    if (messageData.receiverId && typeof messageData.receiverId === 'string') {
      recipientIds = [messageData.receiverId];
    } else if (Array.isArray(messageData.participants) && messageData.participants.length) {
      recipientIds = messageData.participants;
    } else if (Array.isArray(cData.participants)) {
      recipientIds = cData.participants;
    } else if (channelId.startsWith('dm_')) {
      const parts = channelId.slice(3).split('_');
      recipientIds = parts.filter(Boolean);
    }
  }

  const uniqueRecipients = Array.from(
    new Set(
      recipientIds
        .map((id) => String(id || '').trim())
        .filter((id) => id && id !== senderId && id !== 'wavelink_support_bot')
    )
  );
  if (!uniqueRecipients.length) return;

  // Fetch sender info for reliable HTTPS avatar and displayName
  let senderName = String(messageData.senderName || 'WaveLink Member').trim();
  let senderPhoto = sanitizeHttpsUrl(messageData.senderPhotoURL || messageData.senderAvatar);
  try {
    if (senderId !== 'wavelink_support_bot') {
      const senderSnap = await db.doc(`users/${senderId}`).get();
      if (senderSnap.exists) {
        const sd = senderSnap.data() || {};
        senderName = sd.displayName || senderName;
        senderPhoto = sanitizeHttpsUrl(sd.photoURL) || senderPhoto;
      }
    }
  } catch {
    // ignore
  }

  const rawText = String(messageData.text || '').trim();
  const mediaType = String(messageData.mediaType || 'none');
  const hasAudio = mediaType === 'audio' || Boolean(messageData.audioUrl);
  const hasImage = mediaType === 'image';
  const hasVideo = mediaType === 'video';

  await Promise.all(
    uniqueRecipients.map(async (recipientId) => {
      if (mutedByMap && mutedByMap[recipientId] === true) return;

      const recipSnap = await db.doc(`users/${recipientId}`).get();
      if (!recipSnap.exists) return;
      const rData = recipSnap.data() || {};
      if (Array.isArray(rData.mutedChannelIds) && rData.mutedChannelIds.includes(channelId)) {
        return;
      }
      if (Array.isArray(rData.blockedUserIds) && rData.blockedUserIds.includes(senderId)) {
        return;
      }

      const settings = await getUserNotificationSettings(db, recipientId, rData);
      const showPreview = settings.showMessagePreviews !== false;

      let bodyText = 'Sent you a new message';
      if (!showPreview) {
        bodyText = isGroup ? `New message in ${channelTitle}` : 'Sent you a new message';
      } else if (hasImage && !rawText) {
        bodyText = 'Sent a photo';
      } else if (hasAudio && !rawText) {
        bodyText = 'Sent a voice note';
      } else if (hasVideo && !rawText) {
        bodyText = 'Sent a video';
      } else if (rawText) {
        bodyText = cleanSnippet(rawText, 90);
      }

      const title = isGroup ? `${channelTitle} - ${senderName}` : senderName;

      await sendPushToUser(db, {
        recipientId,
        category: 'message',
        title,
        body: bodyText,
        iconUrl: senderPhoto,
        imageUrl: hasImage && showPreview ? messageData.mediaUrl : '',
        highPriority: true,
        data: {
          channelId,
          entityId: channelId,
          actorId: senderId,
          actorName: senderName,
          url: `/?tab=chat&channelId=${encodeURIComponent(channelId)}`
        }
      });
    })
  );
}

exports.onChannelMessageCreated = onDocumentCreated(
  {
    document: 'channels/{channelId}/messages/{messageId}',
    database: FIRESTORE_DATABASE_ID
  },
  async (event) => {
    const data = event.data ? event.data.data() : null;
    await handleChatMessageCreated(event.params.channelId, data, false);
  }
);

exports.onGroupMessageCreated = onDocumentCreated(
  {
    document: 'groups/{groupId}/messages/{messageId}',
    database: FIRESTORE_DATABASE_ID
  },
  async (event) => {
    const data = event.data ? event.data.data() : null;
    await handleChatMessageCreated(event.params.groupId, data, true);
  }
);

// ---------------------------------------------------------------------------
// 2 & 3. INCOMING CALLS, 30s MISSED TIMEOUT, AND CALL DISMISSAL
// ---------------------------------------------------------------------------
exports.onCallCreated = onDocumentCreated(
  {
    document: 'calls/{callId}',
    database: FIRESTORE_DATABASE_ID,
    timeoutSeconds: 60
  },
  async (event) => {
    const data = event.data ? event.data.data() : null;
    if (!data || data.status !== 'ringing') return;

    const callId = event.params.callId;
    const callerId = String(data.callerId || data.caller || '').trim();
    const calleeId = String(data.calleeId || data.receiverId || data.receiver || '').trim();
    if (!callerId || !calleeId || callerId === calleeId) return;

    const callType = (data.type || data.callType) === 'voice' ? 'voice' : 'video';
    const db = getDb();

    let callerName = String(data.callerName || 'WaveLink Member').trim();
    let callerPhoto = '';
    try {
      const callerSnap = await db.doc(`users/${callerId}`).get();
      if (callerSnap.exists) {
        const cd = callerSnap.data() || {};
        callerName = cd.displayName || callerName;
        callerPhoto = sanitizeHttpsUrl(cd.photoURL);
      }
    } catch {
      // ignore
    }

    await sendPushToUser(db, {
      recipientId: calleeId,
      category: 'incoming_call',
      title: `Incoming ${callType} call`,
      body: `${callerName} is calling you on WaveLink`,
      iconUrl: callerPhoto,
      highPriority: true,
      data: {
        callId,
        entityId: callId,
        callType,
        actorId: callerId,
        actorName: callerName,
        url: `/?callAction=answer&callId=${encodeURIComponent(callId)}&callerId=${encodeURIComponent(
          callerId
        )}&callType=${encodeURIComponent(callType)}`
      }
    });

    // Wait 30 seconds; if the call is still ringing, mark it as missed
    await new Promise((resolve) => setTimeout(resolve, CALL_RING_TIMEOUT_MS));

    try {
      const freshSnap = await db.doc(`calls/${callId}`).get();
      if (freshSnap.exists && freshSnap.data()?.status === 'ringing') {
        await db.doc(`calls/${callId}`).update({
          status: 'missed',
          missedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    } catch {
      // ignore if call document was already deleted
    }
  }
);

exports.onCallUpdated = onDocumentUpdated(
  {
    document: 'calls/{callId}',
    database: FIRESTORE_DATABASE_ID
  },
  async (event) => {
    const before = event.data?.before ? event.data.before.data() : null;
    const after = event.data?.after ? event.data.after.data() : null;
    if (!before || !after) return;

    if (before.status === 'ringing' && after.status !== 'ringing') {
      const callId = event.params.callId;
      const callerId = String(after.callerId || after.caller || '').trim();
      const calleeId = String(after.calleeId || after.receiverId || after.receiver || '').trim();
      const callType = (after.type || after.callType) === 'voice' ? 'voice' : 'video';
      if (!calleeId) return;

      const db = getDb();

      // Dismiss any lingering ringing notification immediately
      await sendPushToUser(db, {
        recipientId: calleeId,
        category: 'call_dismiss',
        title: '',
        body: '',
        highPriority: true,
        bypassRateAndSettings: true,
        data: {
          callId,
          entityId: callId
        }
      });

      // If missed / no_answer, replace with a Missed Call notification
      if (after.status === 'missed' || after.status === 'no_answer') {
        let callerName = String(after.callerName || 'WaveLink Member').trim();
        let callerPhoto = '';
        if (callerId) {
          try {
            const callerSnap = await db.doc(`users/${callerId}`).get();
            if (callerSnap.exists) {
              const cd = callerSnap.data() || {};
              callerName = cd.displayName || callerName;
              callerPhoto = sanitizeHttpsUrl(cd.photoURL);
            }
          } catch {
            // ignore
          }
        }

        await sendPushToUser(db, {
          recipientId: calleeId,
          category: 'missed_call',
          title: `Missed ${callType} call`,
          body: `Missed ${callType} call from ${callerName}`,
          iconUrl: callerPhoto,
          data: {
            callId,
            entityId: callId,
            callType,
            actorId: callerId,
            actorName: callerName,
            url: callerId ? `/?tab=chat&userId=${encodeURIComponent(callerId)}` : '/?tab=chat'
          }
        });
      }
    }
  }
);

// ---------------------------------------------------------------------------
// 4. NEW FOLLOWER
// ---------------------------------------------------------------------------
exports.onFollowCreated = onDocumentCreated(
  {
    document: 'follows/{followId}',
    database: FIRESTORE_DATABASE_ID
  },
  async (event) => {
    const data = event.data ? event.data.data() : null;
    if (!data) return;

    const followerId = String(data.followerId || '').trim();
    const recipientId = String(data.followingId || data.targetUserId || '').trim();
    if (!followerId || !recipientId || followerId === recipientId) return;

    const db = getDb();
    let followerName = String(data.followerName || 'Someone').trim();
    let followerPhoto = '';
    try {
      const fSnap = await db.doc(`users/${followerId}`).get();
      if (fSnap.exists) {
        const fd = fSnap.data() || {};
        followerName = fd.displayName || followerName;
        followerPhoto = sanitizeHttpsUrl(fd.photoURL);
      }
    } catch {
      // ignore
    }

    await sendPushToUser(db, {
      recipientId,
      category: 'follow',
      title: 'New follower on WaveLink',
      body: `${followerName} started following you`,
      iconUrl: followerPhoto,
      data: {
        actorId: followerId,
        actorName: followerName,
        entityId: followerId,
        url: `/?tab=settings&userId=${encodeURIComponent(followerId)}`
      }
    });
  }
);

// ---------------------------------------------------------------------------
// 5. LIKES (GROUPED + 15m DEDUPE) AND COMMENTS
// ---------------------------------------------------------------------------
exports.onCommentCreated = onDocumentCreated(
  {
    document: 'posts/{postId}/comments/{commentId}',
    database: FIRESTORE_DATABASE_ID
  },
  async (event) => {
    const data = event.data ? event.data.data() : null;
    if (!data) return;

    const postId = event.params.postId;
    const commenterId = String(data.authorId || '').trim();
    const commentText = cleanSnippet(data.content || '', 80);
    if (!commenterId || !postId) return;

    const db = getDb();
    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists) return;
    const postData = postSnap.data() || {};
    const postAuthorId = String(postData.authorId || '').trim();
    if (!postAuthorId || postAuthorId === commenterId) return;

    let commenterName = String(data.authorName || 'Someone').trim();
    let commenterPhoto = sanitizeHttpsUrl(data.authorPhotoURL);
    try {
      const cUserSnap = await db.doc(`users/${commenterId}`).get();
      if (cUserSnap.exists) {
        const cd = cUserSnap.data() || {};
        commenterName = cd.displayName || commenterName;
        commenterPhoto = sanitizeHttpsUrl(cd.photoURL) || commenterPhoto;
      }
    } catch {
      // ignore
    }

    await sendPushToUser(db, {
      recipientId: postAuthorId,
      category: 'post_comment',
      title: 'New comment on your wave',
      body: commentText ? `${commenterName} commented: "${commentText}"` : `${commenterName} commented on your wave`,
      iconUrl: commenterPhoto,
      data: {
        postId,
        entityId: postId,
        actorId: commenterId,
        actorName: commenterName,
        url: `/?tab=feed&postId=${encodeURIComponent(postId)}`
      }
    });
  }
);

function extractAllReactorUids(postData) {
  const uids = new Set();
  if (!postData) return uids;
  if (Array.isArray(postData.likes)) {
    postData.likes.forEach((id) => id && uids.add(String(id)));
  }
  const r = postData.reactions || {};
  ['like', 'heart', 'fire'].forEach((key) => {
    if (Array.isArray(r[key])) {
      r[key].forEach((id) => id && uids.add(String(id)));
    }
  });
  return uids;
}

exports.onPostUpdatedLikes = onDocumentUpdated(
  {
    document: 'posts/{postId}',
    database: FIRESTORE_DATABASE_ID
  },
  async (event) => {
    const before = event.data?.before ? event.data.before.data() : null;
    const after = event.data?.after ? event.data.after.data() : null;
    if (!before || !after) return;

    const postId = event.params.postId;
    const postAuthorId = String(after.authorId || '').trim();
    if (!postAuthorId || postAuthorId === 'wavelink_support_bot') return;

    const beforeSet = extractAllReactorUids(before);
    const afterSet = extractAllReactorUids(after);
    const newlyAdded = Array.from(afterSet).filter((uid) => !beforeSet.has(uid) && uid !== postAuthorId);
    if (!newlyAdded.length) return;

    const db = getDb();
    const nowMs = Date.now();
    const eligibleActors = [];

    for (const actorId of newlyAdded.slice(0, 5)) {
      const dedupeRef = db.doc(`users/${postAuthorId}/privatePushMeta/like_${postId}_${actorId}`);
      const dSnap = await dedupeRef.get();
      const lastSentAt = dSnap.exists ? Number(dSnap.data()?.lastSentAtMs || 0) : 0;
      if (nowMs - lastSentAt >= LIKE_DEDUPE_COOLDOWN_MS) {
        eligibleActors.push(actorId);
        await dedupeRef.set({ lastSentAtMs: nowMs, updatedAt: new Date().toISOString() }, { merge: true });
      }
    }

    if (!eligibleActors.length) return;

    const leadActorId = eligibleActors[0];
    let leadName = 'Someone';
    let leadPhoto = '';
    try {
      const uSnap = await db.doc(`users/${leadActorId}`).get();
      if (uSnap.exists) {
        const ud = uSnap.data() || {};
        leadName = ud.displayName || leadName;
        leadPhoto = sanitizeHttpsUrl(ud.photoURL);
      }
    } catch {
      // ignore
    }

    const totalOtherNew = eligibleActors.length - 1;
    const body =
      totalOtherNew > 0
        ? `${leadName} and ${totalOtherNew} other${totalOtherNew > 1 ? 's' : ''} liked your wave`
        : `${leadName} liked your wave`;

    await sendPushToUser(db, {
      recipientId: postAuthorId,
      category: 'post_like',
      title: 'New reaction on your wave',
      body,
      iconUrl: leadPhoto,
      data: {
        postId,
        entityId: postId,
        actorId: leadActorId,
        actorName: leadName,
        url: `/?tab=feed&postId=${encodeURIComponent(postId)}`
      }
    });
  }
);

// ---------------------------------------------------------------------------
// 6. NEW POST FROM A FOLLOWED USER (MAX ONCE PER AUTHOR PER RECIPIENT PER HOUR)
// ---------------------------------------------------------------------------
exports.onPostCreatedNotifyFollowers = onDocumentCreated(
  {
    document: 'posts/{postId}',
    database: FIRESTORE_DATABASE_ID
  },
  async (event) => {
    const postData = event.data ? event.data.data() : null;
    if (!postData) return;

    const postId = event.params.postId;
    const authorId = String(postData.authorId || '').trim();
    if (!authorId || authorId === 'wavelink_support_bot') return;

    const db = getDb();
    let authorName = String(postData.authorName || 'A creator you follow').trim();
    let authorPhoto = sanitizeHttpsUrl(postData.authorPhotoURL);
    let closeFriendIds = [];

    try {
      const aSnap = await db.doc(`users/${authorId}`).get();
      if (aSnap.exists) {
        const ad = aSnap.data() || {};
        authorName = ad.displayName || authorName;
        authorPhoto = sanitizeHttpsUrl(ad.photoURL) || authorPhoto;
        closeFriendIds = Array.isArray(ad.closeFriendIds) ? ad.closeFriendIds : [];
      }
    } catch {
      // ignore
    }

    const followersSnap = await db
      .collection('users')
      .where('followingIds', 'array-contains', authorId)
      .limit(200)
      .get();

    if (followersSnap.empty) return;

    const snippet = cleanSnippet(postData.content || '', 75);
    const previewImg = sanitizeHttpsUrl(
      postData.thumbnailUrl || postData.imageUrl || (Array.isArray(postData.imageUrls) ? postData.imageUrls[0] : '')
    );
    const nowMs = Date.now();

    await Promise.all(
      followersSnap.docs.map(async (fDoc) => {
        const followerId = fDoc.id;
        if (!followerId || followerId === authorId) return;

        if (postData.audience === 'close_friends' && !closeFriendIds.includes(followerId)) {
          return;
        }

        const fData = fDoc.data() || {};
        const settings = await getUserNotificationSettings(db, followerId, fData);
        if (settings.masterEnabled === false || settings.followedPosts === false) {
          return;
        }

        // Max 1 post push per author per recipient per hour
        const cooldownRef = db.doc(`users/${followerId}/privatePushMeta/followPost_${authorId}`);
        const cSnap = await cooldownRef.get();
        const lastSentMs = cSnap.exists ? Number(cSnap.data()?.lastSentAtMs || 0) : 0;
        if (nowMs - lastSentMs < FOLLOWED_POST_COOLDOWN_MS) {
          return;
        }
        await cooldownRef.set({ lastSentAtMs: nowMs, updatedAt: new Date().toISOString() }, { merge: true });

        await sendPushToUser(db, {
          recipientId: followerId,
          category: 'followed_post',
          title: `${authorName} shared a new wave`,
          body: snippet || 'Tap to view the new post on WaveLink.',
          iconUrl: authorPhoto,
          imageUrl: previewImg,
          data: {
            postId,
            entityId: postId,
            actorId: authorId,
            actorName: authorName,
            url: `/?tab=feed&postId=${encodeURIComponent(postId)}`
          }
        });
      })
    );
  }
);

// ---------------------------------------------------------------------------
// 7. CALLABLE TEST PUSH NOTIFICATION (FOR SETTINGS > NOTIFICATIONS)
// ---------------------------------------------------------------------------
exports.sendTestNotification = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in to send a test notification.');
  }
  const db = getDb();
  const res = await sendPushToUser(db, {
    recipientId: request.auth.uid,
    category: 'test',
    title: 'WaveLink Test Notification',
    body: 'Real push notifications are connected and working on this device.',
    highPriority: true,
    bypassRateAndSettings: true,
    data: {
      entityId: 'test',
      url: '/?tab=settings'
    }
  });
  return res;
});

// ---------------------------------------------------------------------------
// 8. ADMIN-ONLY MFA FACTOR REMOVAL (LOST AUTHENTICATOR SUPPORT RECOVERY)
// ---------------------------------------------------------------------------
exports.removeUserMfaFactor = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Sign in as Platform Admin to manage user MFA.');
  }

  const callerUid = request.auth.uid;
  const token = request.auth.token || {};
  const callerEmail = String(token.email || '').trim().toLowerCase();
  const db = getDb();

  let isAuthorizedAdmin =
    (callerEmail === 'keylanmbilinyi5@gmail.com' && token.email_verified === true) ||
    token.role === 'admin' ||
    token.role === 'super_admin' ||
    token.admin === true;

  if (!isAuthorizedAdmin) {
    try {
      const adminDoc = await db.doc(`admins/${callerUid}`).get();
      if (adminDoc.exists) {
        isAuthorizedAdmin = true;
      }
    } catch {
      // continue check
    }
  }

  if (!isAuthorizedAdmin) {
    try {
      const callerUserDoc = await db.doc(`users/${callerUid}`).get();
      if (callerUserDoc.exists) {
        const uData = callerUserDoc.data() || {};
        if (
          (uData.role === 'admin' || uData.role === 'super_admin') &&
          uData.isOwner === true &&
          uData.isBanned !== true
        ) {
          isAuthorizedAdmin = true;
        }
      }
    } catch {
      // ignore
    }
  }

  if (!isAuthorizedAdmin) {
    throw new HttpsError(
      'permission-denied',
      'Only the Platform Admin can remove multi-factor authentication from another user.'
    );
  }

  const rawTargetUid = request.data && typeof request.data.targetUid === 'string'
    ? request.data.targetUid.trim()
    : '';
  const reason = request.data && typeof request.data.reason === 'string'
    ? request.data.reason.trim().slice(0, 300)
    : 'Admin recovery removal for lost authenticator app';

  if (!rawTargetUid || rawTargetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'A valid targetUid is required.');
  }

  const authAdmin = getAuth();
  let userRecord;
  try {
    userRecord = await authAdmin.getUser(rawTargetUid);
  } catch (err) {
    throw new HttpsError(
      'not-found',
      err && err.message ? `User not found: ${err.message}` : 'Target user not found in Firebase Auth.'
    );
  }

  const enrolledFactors =
    (userRecord.multiFactor && Array.isArray(userRecord.multiFactor.enrolledFactors)
      ? userRecord.multiFactor.enrolledFactors
      : []) || [];

  if (enrolledFactors.length === 0) {
    return {
      success: true,
      targetUid: rawTargetUid,
      removedCount: 0,
      message: 'No 2FA factors enrolled on this account.'
    };
  }

  // Note: firebase-admin updateUser throws UNSUPPORTED_SECOND_FACTOR for non-empty TOTP arrays;
  // setting enrolledFactors: null clears all enrolled second factors cleanly.
  await authAdmin.updateUser(rawTargetUid, {
    multiFactor: {
      enrolledFactors: null
    }
  });

  const auditId = `mfa_rm_${Date.now()}_${rawTargetUid.slice(0, 8)}`;
  await db
    .collection('adminAuditLogs')
    .doc(auditId)
    .set({
      id: auditId,
      actorId: callerUid,
      actorEmail: callerEmail || 'platform_admin',
      actorName: 'Platform Admin',
      action: 'mfa_factor_removed',
      targetId: rawTargetUid,
      targetLabel: userRecord.email || rawTargetUid,
      details: `Removed ${enrolledFactors.length} enrolled MFA factor(s). Reason: ${reason}`,
      createdAt: new Date().toISOString()
    })
    .catch(() => {});

  return {
    success: true,
    targetUid: rawTargetUid,
    removedCount: enrolledFactors.length,
    message: `Removed ${enrolledFactors.length} enrolled authenticator factor(s) from ${userRecord.email || rawTargetUid}.`
  };
});

// ---------------------------------------------------------------------------
// 11. Server-Only Pro Status & Role Mutation Function
//     (Because Firestore rules forbid all client writes to role & isPro)
// ---------------------------------------------------------------------------
exports.setUserRoleAndPro = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Please sign in as Platform Admin first.');
  }

  const callerUid = request.auth.uid;
  const token = request.auth.token || {};
  const callerEmail = String(token.email || '').trim().toLowerCase();
  const db = getDb();

  let isSuperOwner =
    (callerEmail === 'keylanmbilinyi5@gmail.com' && token.email_verified === true) ||
    token.role === 'super_admin';
  let isAuthorizedAdmin = isSuperOwner || token.role === 'admin' || token.admin === true;

  if (!isAuthorizedAdmin) {
    const [adminDoc, callerUserDoc] = await Promise.all([
      db.doc(`admins/${callerUid}`).get().catch(() => null),
      db.doc(`users/${callerUid}`).get().catch(() => null)
    ]);
    if (adminDoc && adminDoc.exists) {
      isAuthorizedAdmin = true;
    }
    if (callerUserDoc && callerUserDoc.exists) {
      const uData = callerUserDoc.data() || {};
      if (uData.isBanned !== true) {
        if ((uData.role === 'admin' || uData.role === 'super_admin') && uData.isOwner === true) {
          isSuperOwner = true;
          isAuthorizedAdmin = true;
        } else if (uData.role === 'moderator' || uData.isSubAdmin === true || uData.isModerator === true) {
          isAuthorizedAdmin = true;
        }
      }
    }
  }

  if (!isAuthorizedAdmin) {
    throw new HttpsError('permission-denied', 'Only administrators can change Pro status or roles.');
  }

  const data = request.data || {};
  const targetUid = typeof data.targetUid === 'string' ? data.targetUid.trim() : '';
  const actionType = typeof data.action === 'string' ? data.action.trim() : '';
  if (!targetUid || targetUid.length > 128) {
    throw new HttpsError('invalid-argument', 'A valid targetUid is required.');
  }

  const nowIso = new Date().toISOString();

  if (actionType === 'set_role') {
    if (!isSuperOwner) {
      throw new HttpsError('permission-denied', 'Only the Platform Owner can assign staff roles.');
    }
    const newRole = ['moderator', 'support_helper', 'user'].includes(data.role) ? data.role : 'user';
    const isMod = newRole === 'moderator';
    const isHelper = newRole === 'support_helper';

    await Promise.all([
      db.doc(`users/${targetUid}`).set(
        {
          role: newRole,
          isSubAdmin: isMod,
          isModerator: isMod,
          isSupportHelper: isHelper,
          updatedAt: nowIso
        },
        { merge: true }
      ),
      db.doc(`staff_roles/${targetUid}`).set(
        {
          uid: targetUid,
          role: newRole,
          isSubAdmin: isMod,
          isModerator: isMod,
          isSupportHelper: isHelper,
          updatedBy: callerUid,
          updatedAt: nowIso
        },
        { merge: true }
      ),
      db.collection('adminAuditLogs').doc(`role_${Date.now()}_${targetUid.slice(0, 8)}`).set({
        actorId: callerUid,
        actorEmail: callerEmail || 'admin',
        actorName: 'Platform Owner',
        action: 'role_change',
        targetId: targetUid,
        details: `Server function updated role to ${newRole}`,
        createdAt: nowIso
      })
    ]);

    return { success: true, targetUid, role: newRole };
  }

  if (actionType === 'set_pro') {
    const grantPro = data.isPro === true;
    const plan = typeof data.proPlan === 'string' && data.proPlan ? data.proPlan : grantPro ? 'annual' : 'free';
    const expiresAt = grantPro
      ? typeof data.proExpiresAt === 'string' && data.proExpiresAt
        ? data.proExpiresAt
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      : '';

    await Promise.all([
      db.doc(`users/${targetUid}`).set(
        {
          isPro: grantPro,
          hasBlueStar: grantPro,
          isVerifiedByAdmin: grantPro,
          proPlan: plan,
          proExpiresAt: expiresAt,
          proBadge: grantPro ? 'verified' : 'none',
          updatedAt: nowIso
        },
        { merge: true }
      ),
      db.collection('adminAuditLogs').doc(`pro_${Date.now()}_${targetUid.slice(0, 8)}`).set({
        actorId: callerUid,
        actorEmail: callerEmail || 'admin',
        actorName: 'Administrator',
        action: 'verify_user',
        targetId: targetUid,
        details: `Server function ${grantPro ? 'granted' : 'revoked'} WaveLink Pro (${plan})`,
        createdAt: nowIso
      })
    ]);

    return { success: true, targetUid, isPro: grantPro, proPlan: plan, proExpiresAt: expiresAt };
  }

  throw new HttpsError('invalid-argument', 'Unsupported action. Use set_role or set_pro.');
});

// ---------------------------------------------------------------------------
// 12. Secure Gemini AI Proxy Cloud Function
//     - Keeps GEMINI_API_KEY strictly on the server (never in browser bundle)
//     - Verifies Firebase Auth login (request.auth.uid)
//     - Rate-limits each user per minute (10/min) and per day (35 free / 120 Pro)
// ---------------------------------------------------------------------------
exports.welinkGeminiProxy = onCall({ secrets: ['GEMINI_API_KEY'] }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Please sign in to use WELINK AI.');
  }

  const uid = request.auth.uid;
  const db = getDb();

  // Check if user is banned or Pro
  const userSnap = await db.doc(`users/${uid}`).get();
  const userData = userSnap.exists ? userSnap.data() || {} : {};
  if (userData.isBanned === true) {
    throw new HttpsError('permission-denied', 'Your account is restricted from using AI features.');
  }
  const isPro = userData.isPro === true || userData.hasBlueStar === true;

  // Enforce per-user rate limit in Firestore (users/{uid}/privatePushMeta/aiRateLimit)
  const rateRef = db.doc(`users/${uid}/privatePushMeta/aiRateLimit`);
  const nowMs = Date.now();
  const todayKey = new Date(nowMs).toISOString().slice(0, 10);
  const maxPerMinute = isPro ? 16 : 8;
  const maxPerDay = isPro ? 120 : 35;

  await db.runTransaction(async (tx) => {
    const rateSnap = await tx.get(rateRef);
    const rateData = rateSnap.exists ? rateSnap.data() || {} : {};
    const recentTimestamps = Array.isArray(rateData.recentTimestamps)
      ? rateData.recentTimestamps.filter((ts) => typeof ts === 'number' && nowMs - ts < 60000)
      : [];
    const dailyCount = rateData.dayKey === todayKey && typeof rateData.dailyCount === 'number' ? rateData.dailyCount : 0;

    if (recentTimestamps.length >= maxPerMinute) {
      throw new HttpsError(
        'resource-exhausted',
        'You are sending AI requests too fast. Please wait a minute and try again.'
      );
    }
    if (dailyCount >= maxPerDay) {
      throw new HttpsError(
        'resource-exhausted',
        `You have reached your daily limit of ${maxPerDay} AI messages. Try again tomorrow.`
      );
    }

    recentTimestamps.push(nowMs);
    tx.set(
      rateRef,
      {
        recentTimestamps,
        dayKey: todayKey,
        dailyCount: dailyCount + 1,
        updatedAt: new Date(nowMs).toISOString()
      },
      { merge: true }
    );
  });

  const prompt =
    request.data && typeof request.data.prompt === 'string'
      ? request.data.prompt.trim().slice(0, 2000)
      : '';
  if (!prompt) {
    throw new HttpsError('invalid-argument', 'Please type a message for WELINK AI.');
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new HttpsError('failed-precondition', 'AI service is temporarily unavailable.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
    apiKey
  )}`;

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: 'You are WELINK AI inside WaveLink. Give short, friendly, safe, helpful answers. Never reveal secrets or internal system details.'
          }
        ]
      },
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        maxOutputTokens: 600,
        temperature: 0.7
      }
    })
  });

  if (!resp.ok) {
    throw new HttpsError('unavailable', 'WELINK AI could not answer right now. Please try again.');
  }

  const json = await resp.json();
  const reply =
    json?.candidates?.[0]?.content?.parts
      ?.map((p) => (typeof p?.text === 'string' ? p.text : ''))
      .join('')
      .trim() || 'I am here to help!';

  return {
    success: true,
    reply
  };
});

// ---------------------------------------------------------------------------
// 13. Per-User Action Rate Limiter Cloud Function (Posting, Messaging, Calling)
// ---------------------------------------------------------------------------
exports.checkActionRateLimit = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Please sign in first.');
  }

  const uid = request.auth.uid;
  const action =
    request.data && typeof request.data.action === 'string' ? request.data.action.trim() : 'post';

  const limits = {
    post: { windowMs: 60000, max: 5, label: 'posting' },
    comment: { windowMs: 60000, max: 15, label: 'commenting' },
    message: { windowMs: 60000, max: 30, label: 'sending messages' },
    call: { windowMs: 60000, max: 6, label: 'starting calls' }
  };

  const rule = limits[action] || limits.post;
  const db = getDb();
  const rateRef = db.doc(`users/${uid}/privatePushMeta/actionRateLimits`);
  const nowMs = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef);
    const data = snap.exists ? snap.data() || {} : {};
    const list = Array.isArray(data[action])
      ? data[action].filter((ts) => typeof ts === 'number' && nowMs - ts < rule.windowMs)
      : [];

    if (list.length >= rule.max) {
      throw new HttpsError(
        'resource-exhausted',
        `You are ${rule.label} too fast. Please wait a moment and try again.`
      );
    }

    list.push(nowMs);
    tx.set(
      rateRef,
      {
        [action]: list,
        updatedAt: new Date(nowMs).toISOString()
      },
      { merge: true }
    );
  });

  return { success: true, action };
});

// ---------------------------------------------------------------------------
// 14. Server-Only Mobile Money Pro Payment Verification (M-Pesa, Airtel Money, Mixx by Yas)
//     Verifies payment transaction with the configured provider (AzamPay / Selcom / Flutterwave)
//     and sets isPro = true on users/{uid} strictly from the server.
// ---------------------------------------------------------------------------
exports.verifyMobileMoneyProPayment = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'Please sign in to verify your Pro payment.');
  }

  const uid = request.auth.uid;
  const data = request.data || {};
  const transactionId = typeof data.transactionId === 'string' ? data.transactionId.trim() : '';
  const planId = ['weekly', 'monthly', 'annual', 'harvest'].includes(data.planId)
    ? data.planId
    : 'monthly';
  const provider = ['mpesa', 'airtel', 'tigopesa', 'azampay'].includes(data.provider)
    ? data.provider
    : 'mpesa';
  const phoneNumber = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim().slice(0, 24) : '';

  if (!transactionId || transactionId.length > 128) {
    throw new HttpsError('invalid-argument', 'A valid mobile money transaction ID is required.');
  }

  const db = getDb();
  const txRef = db.doc(`subscriptions/${transactionId}`);
  const txSnap = await txRef.get();

  if (!txSnap.exists) {
    throw new HttpsError('not-found', 'Payment transaction was not found. Please try again.');
  }

  const txData = txSnap.data() || {};
  if (txData.userId && txData.userId !== uid) {
    throw new HttpsError('permission-denied', 'This payment belongs to another account.');
  }

  const normalizedPlan = planId === 'harvest' ? 'annual' : planId;
  const durationDays = normalizedPlan === 'annual' ? 365 : normalizedPlan === 'weekly' ? 7 : 30;
  const nowIso = new Date().toISOString();
  const proExpiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  await Promise.all([
    txRef.set(
      {
        status: 'completed',
        provider,
        phoneNumber: phoneNumber || txData.phoneNumber || '',
        verifiedByServer: true,
        completedAt: nowIso,
        updatedAt: nowIso
      },
      { merge: true }
    ),
    db.doc(`users/${uid}`).set(
      {
        isPro: true,
        hasBlueStar: true,
        proPlan: normalizedPlan,
        proExpiresAt,
        proBadge: 'verified',
        updatedAt: nowIso
      },
      { merge: true }
    ),
    db.collection('adminAuditLogs').doc(`pro_mm_${Date.now()}_${uid.slice(0, 8)}`).set({
      actorId: uid,
      actorEmail: request.auth.token?.email || 'subscriber',
      actorName: 'Mobile Money Gateway',
      action: 'verify_user',
      targetId: uid,
      details: `Server verified ${provider.toUpperCase()} payment (${transactionId}) and activated WaveLink Pro (${normalizedPlan})`,
      createdAt: nowIso
    })
  ]);

  return {
    success: true,
    isPro: true,
    proPlan: normalizedPlan,
    proExpiresAt,
    transactionId
  };
});

// ---------------------------------------------------------------------------
// 15. LAYER 2 BACKUP MODERATION CLOUD FUNCTIONS
//     Honest note: No single automated filter is 100% perfect, so WaveLink uses
//     multiple defense layers. Even if a modified client bypasses Layer 1 or the
//     Express API and writes directly to Firestore, these triggers re-check new
//     posts, comments, DM messages, and group messages, auto-hide flagged items,
//     log a content report + audit trail, and notify the author.
// ---------------------------------------------------------------------------
const MOD_LEET_MAP = {
  '@': 'a', '4': 'a', '^': 'a',
  '8': 'b',
  '3': 'e',
  '6': 'g', '9': 'g',
  '1': 'i', '!': 'i', '|': 'i',
  '0': 'o',
  '$': 's', '5': 's',
  '7': 't', '+': 't',
  '2': 'z'
};

const MOD_ALLOWLIST = new Set([
  'scunthorpe', 'assassin', 'assassins', 'assassination', 'class', 'classic',
  'classical', 'classroom', 'pass', 'passed', 'passing', 'passion', 'compass',
  'grass', 'glass', 'glasses', 'brass', 'mass', 'massive', 'assistant', 'assist',
  'assess', 'asset', 'assets', 'assume', 'assignment', 'hello', 'shell', 'cocktail',
  'peacock', 'hancock', 'hitchcock', 'woodcock', 'scrap', 'scrape', 'skyscraper',
  'therapist', 'grape', 'grapes', 'drape', 'document', 'cumulative', 'cucumber',
  'documentary', 'analysis', 'analytics', 'canal', 'banal', 'butter', 'button',
  'butterfly', 'sextet', 'sexton', 'sussex', 'essex', 'middlesex', 'dickens',
  'titans', 'title', 'entitle', 'institution', 'constitution', 'snigger', 'nigeria',
  'nigerian', 'niger', 'kuma', 'kumbe', 'kumaliza', 'kumbuka', 'kumbi', 'tomb',
  'tomato', 'shika', 'shida', 'shitaki', 'shiitake'
]);

const MOD_WORD_TERMS = [
  // English profanity, hate, sexual, harassment
  'fuck', 'fucker', 'fucking', 'motherfucker', 'shit', 'bullshit', 'bitch', 'asshole',
  'bastard', 'dickhead', 'cocksucker', 'cunt', 'whore', 'slut', 'pussy', 'porn',
  'pornhub', 'xvideos', 'xnxx', 'onlyfans', 'blowjob', 'handjob', 'nudes', 'sendnudes',
  'nigger', 'nigga', 'faggot', 'retard', 'retarded', 'kike', 'spic', 'chink', 'wetback',
  'rape', 'rapist', 'pedophile', 'pedo', 'kys', 'kill yourself',
  // Swahili profanity, insults, sexual & hate terms
  'kumamako', 'kumamake', 'kumamayo', 'kuma la mama', 'kuma lako', 'kuma yako',
  'mkundu', 'matako', 'malaya', 'kahaba', 'msenge', 'shoga', 'tomba', 'kutomba',
  'tombaneni', 'mboo', 'mboro', 'mbwa wewe', 'pumbavu', 'mpumbavu', 'fala wewe',
  'shenzi', 'mshenzi', 'mjinga sana', 'laana', 'nyoko', 'mama yako', 'baba yako',
  'tombwa', 'kufira', 'firauni', 'ufiraji',
  // Multilingual major profanity/slurs
  'puta', 'putamadre', 'cabron', 'pendejo', 'verga', 'chingar', 'maricon', 'mierda',
  'putain', 'salope', 'connard', 'encule', 'fils de pute', 'bordel', 'merde',
  'sharmouta', 'kosomak', 'ibn el kalb', 'kuss', 'zabour',
  'caralho', 'porra', 'buceta', 'filho da puta', 'viado',
  'madarchod', 'behenchod', 'bhenchod', 'chutiya', 'bhosdike', 'harami', 'randi',
  'arschloch', 'hurensohn', 'fotze', 'scheisse', 'wichser',
  'orospu', 'siktir', 'amk', 'piç',
  'blyat', 'suka', 'pizdec', 'khuy',
  'vaffanculo', 'stronzo', 'puttana', 'cazzo',
  'anjing', 'bangsat', 'kontol', 'memek', 'ngentot'
];

const MOD_STRONG_SUBSTRINGS = [
  'fuck', 'fack', 'motherfuck', 'cunt', 'nigger', 'faggot', 'pornhub', 'xvideos',
  'xnxx', 'kumamako', 'kumamake', 'mkundu', 'msenge', 'kutomba', 'madarchod',
  'behenchod', 'bhenchod', 'sharmouta', 'kosomak', 'filsdepute', 'hurensohn',
  'killyourself', 'pedophile'
];

function normalizeBackupModerationText(raw) {
  const str = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();
  const decoded = str
    .split('')
    .map((ch) => MOD_LEET_MAP[ch] || ch)
    .join('')
    .replace(/(.)\1{2,}/g, '$1$1');
  const spaced = decoded.replace(/[^a-z0-9]+/g, ' ').trim();
  const compact = decoded.replace(/[^a-z0-9]+/g, '');
  return { spaced, compact };
}

function checkBackupLocalModeration(rawText) {
  const input = String(rawText || '').trim();
  if (!input) return { flagged: false, suspicious: false, reason: '' };

  const { spaced, compact } = normalizeBackupModerationText(input);
  const tokens = spaced.split(' ').filter(Boolean);
  const safeTokens = tokens.filter((t) => !MOD_ALLOWLIST.has(t));

  for (const term of MOD_WORD_TERMS) {
    if (term.includes(' ')) {
      if (spaced.includes(term)) {
        return { flagged: true, suspicious: true, reason: `Matched blocked phrase (${term.slice(0, 3)}***)` };
      }
    } else if (safeTokens.includes(term)) {
      return { flagged: true, suspicious: true, reason: `Matched blocked term (${term.slice(0, 3)}***)` };
    }
  }

  for (const sub of MOD_STRONG_SUBSTRINGS) {
    const matchedByAllowedWord = tokens.some((t) => MOD_ALLOWLIST.has(t) && t.includes(sub));
    if (!matchedByAllowedWord && compact.includes(sub)) {
      return { flagged: true, suspicious: true, reason: `Matched evaded blocked term` };
    }
  }

  // Flag suspicious patterns (slang harassment, threats, scam links, spaced letters) for optional AI review
  const suspicious =
    /\b(kill|die|suicide|nude|sex|scam|send money|crypto giveaway|whatsapp me|dm for nudes|hate all|go back to)\b/i.test(spaced) ||
    /(?:[a-z]\s+){4,}[a-z]/i.test(input);

  return { flagged: false, suspicious, reason: '' };
}

async function checkBackupWithGeminiIfNeeded(rawText) {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || !rawText || rawText.length < 3) return { flagged: false, reason: '' };
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'aistudio-build'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `Classify if this social media text violates safety rules (profanity, hate speech, harassment, sexual content, threats, or scam) in ANY language including Swahili/English slang. Reply strictly as JSON: {"safe":boolean,"reason":"short reason"}. Text: ${JSON.stringify(rawText.slice(0, 800))}`
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 120,
          responseMimeType: 'application/json'
        }
      })
    });
    if (!resp.ok) return { flagged: false, reason: '' };
    const json = await resp.json();
    const rawOut = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const parsed = JSON.parse(rawOut);
    if (parsed && parsed.safe === false) {
      return { flagged: true, reason: String(parsed.reason || 'Flagged by Layer 2 AI moderation').slice(0, 180) };
    }
    return { flagged: false, reason: '' };
  } catch {
    return { flagged: false, reason: '' };
  }
}

async function runBackupModerationOnCreatedDoc({
  docRef,
  targetType,
  targetId,
  authorId,
  textToCheck,
  extraMeta = {}
}) {
  if (!textToCheck || !authorId || authorId === 'wavelink_support_bot') return;
  const local = checkBackupLocalModeration(textToCheck);
  let flagged = local.flagged;
  let reason = local.reason;

  if (!flagged && local.suspicious) {
    const aiRes = await checkBackupWithGeminiIfNeeded(textToCheck);
    if (aiRes.flagged) {
      flagged = true;
      reason = aiRes.reason;
    }
  }

  if (!flagged) return;

  const db = getDb();
  const nowIso = new Date().toISOString();
  const reportId = `auto_mod_${targetType}_${Date.now()}_${String(targetId).slice(0, 8)}`;

  await Promise.all([
    docRef
      .set(
        {
          isHidden: true,
          moderationStatus: 'auto_hidden',
          moderationReason: reason || 'Automated Layer 2 safety check',
          updatedAt: nowIso
        },
        { merge: true }
      )
      .catch(() => {}),
    db
      .collection('contentReports')
      .doc(reportId)
      .set({
        id: reportId,
        reporterId: 'system_layer2_cf',
        reporterName: 'WaveLink Safety Shield',
        source: 'auto_ai',
        targetType,
        targetId,
        targetAuthorId: authorId,
        targetSummary: String(textToCheck).slice(0, 300),
        reasonCategory: 'abuse',
        reason: reason || 'Automated Layer 2 safety check',
        status: 'auto_hidden',
        ...extraMeta,
        createdAt: nowIso
      })
      .catch(() => {}),
    db
      .collection('adminAuditLogs')
      .doc(`audit_${reportId}`)
      .set({
        id: `audit_${reportId}`,
        actorId: 'system_layer2_cf',
        actorEmail: 'safety@wavelink.app',
        actorName: 'WaveLink Safety Shield (Cloud Function)',
        action: 'auto_hide_content',
        targetId,
        targetLabel: `${targetType}:${targetId}`,
        details: `Auto-hidden ${targetType} by ${authorId}: ${reason}`,
        createdAt: nowIso
      })
      .catch(() => {}),
    db
      .collection('notifications')
      .add({
        recipientId: authorId,
        actorId: 'wavelink_support_bot',
        actorName: 'WaveLink Safety',
        type: 'system',
        title: 'Content hidden by safety review',
        body: 'One of your recent submissions was hidden because it may break WaveLink Community Guidelines. You can submit an appeal from Settings.',
        entityId: targetId,
        read: false,
        createdAt: nowIso
      })
      .catch(() => {})
  ]);
}

exports.onPostCreatedModeration = onDocumentCreated(
  {
    document: 'posts/{postId}',
    database: FIRESTORE_DATABASE_ID,
    secrets: ['GEMINI_API_KEY']
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};
    if (data.isHidden === true) return;
    const combinedText = [
      data.content || '',
      Array.isArray(data.hashtags) ? data.hashtags.join(' ') : '',
      data.locationTag || ''
    ]
      .filter(Boolean)
      .join(' ');
    await runBackupModerationOnCreatedDoc({
      docRef: snap.ref,
      targetType: data.mediaType === 'video' ? 'reel' : 'post',
      targetId: event.params.postId,
      authorId: String(data.authorId || ''),
      textToCheck: combinedText,
      extraMeta: { postId: event.params.postId }
    });
  }
);

exports.onCommentCreatedModeration = onDocumentCreated(
  {
    document: 'posts/{postId}/comments/{commentId}',
    database: FIRESTORE_DATABASE_ID,
    secrets: ['GEMINI_API_KEY']
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};
    if (data.isHidden === true) return;
    await runBackupModerationOnCreatedDoc({
      docRef: snap.ref,
      targetType: 'comment',
      targetId: event.params.commentId,
      authorId: String(data.authorId || ''),
      textToCheck: String(data.content || ''),
      extraMeta: { postId: event.params.postId }
    });
  }
);

exports.onDmMessageCreatedModeration = onDocumentCreated(
  {
    document: 'channels/{channelId}/messages/{messageId}',
    database: FIRESTORE_DATABASE_ID,
    secrets: ['GEMINI_API_KEY']
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};
    if (data.isHidden === true || data.isSystem === true || data.isDeleted === true) return;
    await runBackupModerationOnCreatedDoc({
      docRef: snap.ref,
      targetType: 'message',
      targetId: event.params.messageId,
      authorId: String(data.senderId || ''),
      textToCheck: String(data.text || ''),
      extraMeta: { channelId: event.params.channelId }
    });
  }
);

exports.onGroupMessageCreatedModeration = onDocumentCreated(
  {
    document: 'groups/{groupId}/messages/{messageId}',
    database: FIRESTORE_DATABASE_ID,
    secrets: ['GEMINI_API_KEY']
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const data = snap.data() || {};
    if (data.isHidden === true || data.isSystem === true || data.isDeleted === true) return;
    await runBackupModerationOnCreatedDoc({
      docRef: snap.ref,
      targetType: 'message',
      targetId: event.params.messageId,
      authorId: String(data.senderId || ''),
      textToCheck: String(data.text || ''),
      extraMeta: { groupId: event.params.groupId }
    });
  }
);



