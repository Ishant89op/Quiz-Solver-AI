// Firebase REST API integration for Chrome Extension
// No SDK needed — uses REST APIs directly

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDmUQXCW7DsU26Lj0JmlLL8nJ6TRqELaTk",
  authDomain: "quiz-solver-ai-ext.firebaseapp.com",
  projectId: "quiz-solver-ai-ext",
  storageBucket: "quiz-solver-ai-ext.firebasestorage.app",
  messagingSenderId: "124890716795",
  appId: "1:124890716795:web:4df3a4bbb1cae7cbeb60de"
};

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents`;
const AUTH_BASE = "https://identitytoolkit.googleapis.com/v1";

// ─── Auth via launchWebAuthFlow ──────────────────────────────────────
export async function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    const redirectUrl = chrome.identity.getRedirectURL();
    const scopes = encodeURIComponent("openid email profile");

    // Use Firebase Auth's Google sign-in via launchWebAuthFlow
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=124890716795-bgb9lkrkl158fg3n4sod02dvoijn0c1i.apps.googleusercontent.com` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
      `&scope=${scopes}`;

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (responseUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!responseUrl) {
          reject(new Error("No response from auth flow"));
          return;
        }

        try {
          // Extract access_token from the redirect URL fragment
          const hashParams = new URL(responseUrl.replace("#", "?")).searchParams;
          const accessToken = hashParams.get("access_token");

          if (!accessToken) {
            reject(new Error("No access token in response"));
            return;
          }

          // Exchange Google OAuth token for Firebase ID token
          const fbResponse = await fetch(
            `${AUTH_BASE}/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                postBody: `access_token=${accessToken}&providerId=google.com`,
                requestUri: redirectUrl,
                returnIdpCredential: true,
                returnSecureToken: true
              })
            }
          );

          const data = await fbResponse.json();
          if (data.error) throw new Error(data.error.message);

          const user = {
            uid: data.localId,
            email: data.email,
            displayName: data.displayName,
            photoUrl: data.photoUrl,
            idToken: data.idToken,
            refreshToken: data.refreshToken
          };

          await chrome.storage.local.set({ qsa_firebase_user: user });
          resolve(user);
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

export async function signOut() {
  try {
    await chrome.identity.clearAllCachedAuthTokens();
  } catch { /* ok */ }
  await chrome.storage.local.remove("qsa_firebase_user");
}

export async function getCurrentUser() {
  const stored = await chrome.storage.local.get("qsa_firebase_user");
  const user = stored.qsa_firebase_user;
  if (!user || !user.idToken) return null;

  try {
    const check = await fetch(
      `${AUTH_BASE}/accounts:lookup?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: user.idToken })
      }
    );
    const result = await check.json();
    if (result.error) {
      const refreshed = await refreshIdToken(user.refreshToken);
      if (refreshed) {
        user.idToken = refreshed;
        await chrome.storage.local.set({ qsa_firebase_user: user });
        return user;
      }
      return null;
    }
    return user;
  } catch {
    return user; // Return cached if offline
  }
}

async function refreshIdToken(refreshToken) {
  try {
    const response = await fetch(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: refreshToken
        })
      }
    );
    const data = await response.json();
    return data.id_token || null;
  } catch {
    return null;
  }
}

// ─── Firestore REST API ──────────────────────────────────────────────
export async function getChats(uid, idToken) {
  const url = `${FIRESTORE_BASE}/users/${uid}/chats?orderBy=updatedAt desc&pageSize=50`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` }
  });
  const data = await response.json();
  if (!data.documents) return [];

  return data.documents.map(doc => ({
    id: doc.name.split("/").pop(),
    title: doc.fields?.title?.stringValue || "Untitled",
    createdAt: doc.fields?.createdAt?.timestampValue || "",
    updatedAt: doc.fields?.updatedAt?.timestampValue || "",
    messages: parseFirestoreArray(doc.fields?.messages?.arrayValue?.values || [])
  }));
}

export async function createChat(uid, idToken, title) {
  const now = new Date().toISOString();
  const url = `${FIRESTORE_BASE}/users/${uid}/chats`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fields: {
        title: { stringValue: title || "New Chat" },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now },
        messages: { arrayValue: { values: [] } }
      }
    })
  });
  const data = await response.json();
  return {
    id: data.name.split("/").pop(),
    title: title || "New Chat",
    createdAt: now,
    updatedAt: now,
    messages: []
  };
}

export async function addMessageToChat(uid, idToken, chatId, messages) {
  const now = new Date().toISOString();
  const url = `${FIRESTORE_BASE}/users/${uid}/chats/${chatId}?updateMask.fieldPaths=messages&updateMask.fieldPaths=updatedAt`;

  const firestoreMessages = messages.map(m => ({
    mapValue: {
      fields: {
        role: { stringValue: m.role },
        content: { stringValue: m.content },
        timestamp: { stringValue: m.timestamp || now }
      }
    }
  }));

  await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fields: {
        updatedAt: { timestampValue: now },
        messages: { arrayValue: { values: firestoreMessages } }
      }
    })
  });
}

export async function deleteChat(uid, idToken, chatId) {
  const url = `${FIRESTORE_BASE}/users/${uid}/chats/${chatId}`;
  await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` }
  });
}

function parseFirestoreArray(values) {
  return (values || []).map(v => {
    const fields = v.mapValue?.fields || {};
    return {
      role: fields.role?.stringValue || "user",
      content: fields.content?.stringValue || "",
      timestamp: fields.timestamp?.stringValue || ""
    };
  });
}

export { FIREBASE_CONFIG };
