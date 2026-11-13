'use strict';

const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const { initializeApp, getApps, getApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

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
