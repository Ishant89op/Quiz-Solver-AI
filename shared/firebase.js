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
const FIRESTORE_SETUP_URL = `https://console.cloud.google.com/datastore/setup?project=${FIREBASE_CONFIG.projectId}`;
const AUTH_BASE = "https://identitytoolkit.googleapis.com/v1";
const AUTH_REQUEST_TIMEOUT_MS = 6000;
const AUTH_FLOW_TIMEOUT_MS = 90000;
// This OAuth web client must allow the Chrome extension redirect below.
const GOOGLE_OAUTH_CLIENT_ID = "124890716795-bgb9lkrkl158fg3n4sod02dvoijn0c1i.apps.googleusercontent.com";
const EXPECTED_EXTENSION_ID = "mofhdjfbodccmpeeklpehejamblhfdhn";
const EXPECTED_REDIRECT_URI = `https://${EXPECTED_EXTENSION_ID}.chromiumapp.org/`;

// ─── Auth via launchWebAuthFlow ──────────────────────────────────────
export async function signInWithGoogle() {
  return new Promise((resolve, reject) => {
    const redirectUrl = chrome.identity.getRedirectURL();
    const scopes = encodeURIComponent("openid email profile");
    const state = createOAuthState();
    let settled = false;
    const timeoutId = setTimeout(() => {
      finishReject(new Error(
        `Google sign-in timed out before completing. If the Google auth page showed an error, add ${redirectUrl} to the OAuth redirect URIs and add ${new URL(redirectUrl).host} to Firebase Auth authorized domains.`
      ));
    }, AUTH_FLOW_TIMEOUT_MS);

    function finishResolve(value) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    }

    function finishReject(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      reject(error);
    }

    if (redirectUrl !== EXPECTED_REDIRECT_URI) {
      finishReject(new Error(
        `Unexpected extension redirect URI. Reload the unpacked extension so it uses the stable ID ${EXPECTED_EXTENSION_ID}, then authorize ${EXPECTED_REDIRECT_URI} in Google OAuth and Firebase Auth.`
      ));
      return;
    }

    // Use Firebase Auth's Google sign-in via launchWebAuthFlow
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(GOOGLE_OAUTH_CLIENT_ID)}` +
      `&response_type=token` +
      `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
      `&scope=${scopes}` +
      `&state=${encodeURIComponent(state)}` +
      `&prompt=select_account`;

    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      async (responseUrl) => {
        if (chrome.runtime.lastError) {
          finishReject(createAuthFlowError(chrome.runtime.lastError.message, redirectUrl));
          return;
        }
        if (!responseUrl) {
          finishReject(new Error(
            `No response from the Google sign-in flow. Verify that ${EXPECTED_REDIRECT_URI} is allowed in your OAuth client and Firebase Auth authorized domains.`
          ));
          return;
        }

        try {
          const params = extractCallbackParams(responseUrl);
          const returnedState = params.get("state");
          const oauthError = params.get("error");

          if (oauthError) {
            throw new Error(describeOAuthError(oauthError, params.get("error_description"), redirectUrl));
          }

          if (returnedState !== state) {
            throw new Error("Invalid Google sign-in response: state mismatch.");
          }

          const accessToken = params.get("access_token");

          if (!accessToken) {
            throw new Error("Google sign-in did not return an access token.");
          }

          // Exchange Google OAuth token for Firebase ID token
          const fbResponse = await fetchWithTimeout(
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
            },
            15000
          );

          if (!fbResponse.ok) {
            const errText = await fbResponse.text();
            throw new Error(`Firebase sign-in failed (${fbResponse.status}): ${errText}`);
          }

          const data = await fbResponse.json();
          if (data.error) throw new Error(describeFirebaseAuthError(data.error.message));

          const user = {
            uid: data.localId,
            email: data.email,
            displayName: data.displayName,
            photoUrl: data.photoUrl,
            idToken: data.idToken,
            refreshToken: data.refreshToken
          };

          await chrome.storage.local.set({ qsa_firebase_user: user });
          finishResolve(user);
        } catch (err) {
          finishReject(err);
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

export async function getCurrentUser(options = {}) {
  const { verify = true } = options;
  const stored = await chrome.storage.local.get("qsa_firebase_user");
  const user = stored.qsa_firebase_user;
  if (!user || !user.idToken) return null;

  if (!verify) {
    return user;
  }

  try {
    const check = await fetchWithTimeout(
      `${AUTH_BASE}/accounts:lookup?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: user.idToken })
      },
      AUTH_REQUEST_TIMEOUT_MS
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
    const response = await fetchWithTimeout(
      `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken
        }).toString()
      },
      AUTH_REQUEST_TIMEOUT_MS
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
  if (!response.ok) {
    throw await createFirestoreRequestError("load chats", response);
  }
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
  if (!response.ok) {
    throw await createFirestoreRequestError("create chat", response);
  }
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

  const response = await fetch(url, {
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
  if (!response.ok) {
    throw await createFirestoreRequestError("save chat messages", response);
  }
}

export async function deleteChat(uid, idToken, chatId) {
  const url = `${FIRESTORE_BASE}/users/${uid}/chats/${chatId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` }
  });
  if (!response.ok) {
    throw await createFirestoreRequestError("delete chat", response);
  }
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

function createOAuthState() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

function extractCallbackParams(responseUrl) {
  const url = new URL(responseUrl);
  const params = new URLSearchParams(url.search);

  if (url.hash) {
    const hashParams = new URLSearchParams(url.hash.slice(1));
    for (const [key, value] of hashParams.entries()) {
      params.set(key, value);
    }
  }

  return params;
}

function createAuthFlowError(message, redirectUrl) {
  const lower = (message || "").toLowerCase();

  if (lower.includes("did not approve") || lower.includes("canceled")) {
    return new Error("Google sign-in was cancelled.");
  }

  if (lower.includes("authorization page could not be loaded")) {
    return new Error(
      `Google sign-in could not load. Verify that ${redirectUrl} is registered as an authorized redirect URI and that ${new URL(redirectUrl).host} is an authorized Firebase Auth domain.`
    );
  }

  return new Error(message || "Google sign-in failed.");
}

function describeOAuthError(error, description, redirectUrl) {
  if (error === "redirect_uri_mismatch") {
    return `Google rejected the extension redirect URI. Add ${redirectUrl} to the OAuth web client redirect URIs and add ${new URL(redirectUrl).host} to Firebase Auth authorized domains.`;
  }

  if (error === "access_denied") {
    return "Google sign-in was denied.";
  }

  return description ? `${error}: ${description}` : `Google sign-in failed: ${error}`;
}

function describeFirebaseAuthError(message) {
  if (!message) return "Firebase sign-in failed.";
  if (message === "INVALID_IDP_RESPONSE" || message === "INVALID_PENDING_TOKEN") {
    return "Firebase rejected the Google sign-in response. Recheck the OAuth client, redirect URI, and Firebase Auth provider configuration.";
  }
  return message;
}

async function createFirestoreRequestError(action, response) {
  const errText = await response.text();
  return new Error(describeFirestoreError(action, response.status, errText));
}

function describeFirestoreError(action, status, errText) {
  const setupInstruction = `Create the default Firestore database for project ${FIREBASE_CONFIG.projectId} at ${FIRESTORE_SETUP_URL}, then reload the extension.`;
  const rulesInstruction = `Deploy the repo's Firestore rules to project ${FIREBASE_CONFIG.projectId} with: firebase deploy --only firestore:rules`;

  try {
    const parsed = JSON.parse(errText);
    const message = parsed?.error?.message || "";

    if (
      status === 404 &&
      /database\s+\(default\)\s+does\s+not\s+exist/i.test(message)
    ) {
      return `Cloud Firestore is not set up for this Firebase project yet. ${setupInstruction}`;
    }

    if (status === 403) {
      if (/missing or insufficient permissions/i.test(message)) {
        return `Firestore denied access while trying to ${action}. ${rulesInstruction}`;
      }

      if (/api has not been used|api is not enabled|service is disabled/i.test(message)) {
        return `The Firestore API is not enabled for project ${FIREBASE_CONFIG.projectId}. Enable Cloud Firestore API in Google Cloud Console, then reload the extension.`;
      }

      return `Firestore rejected the request while trying to ${action}. Check your Firestore rules and API permissions for project ${FIREBASE_CONFIG.projectId}.`;
    }

    if (message) {
      return `Failed to ${action} (${status}): ${message}`;
    }
  } catch {
    // Fall through to the raw-text fallback below.
  }

  return `Failed to ${action} (${status}): ${errText}`;
}

async function fetchWithTimeout(url, options, timeoutMs = AUTH_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export { FIREBASE_CONFIG };
