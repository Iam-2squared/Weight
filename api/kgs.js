import {createHmac, randomBytes, timingSafeEqual} from "node:crypto";

const SESSION = "__Host-weight-kgs-session";
const ATTEMPT = "__Host-weight-kgs-attempt";
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const MAX_AGE = 7 * 24 * 60 * 60;

function config() {
  const secret = process.env.KGS_WEIGHT_INTEGRATION_SECRET;
  const rawOrigin = process.env.KGS_WEIGHT_API_ORIGIN;
  if (typeof secret !== "string" || secret.length < 32 || secret.length > 512 || /\s/.test(secret)) {
    throw new Error("KGS integration not configured");
  }
  let origin;
  try {
    const url = new URL(rawOrigin);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash)
      throw new Error("Invalid origin");
    origin = url.origin;
  } catch {
    throw new Error("KGS origin not configured");
  }
  return {secret, origin};
}
function toOrigin(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const protocol = req.headers["x-forwarded-proto"] || (process.env.VERCEL === "1" ? "https" : "http");
  if (typeof host !== "string" || !/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host)) return null;
  if (protocol !== "https" && protocol !== "http") return null;
  return protocol + "://" + host;
}
function requireSameOrigin(req) {
  const origin = toOrigin(req);
  if (!origin || req.headers.origin !== origin || req.headers["sec-fetch-site"] === "cross-site") {
    const error = new Error("Origin rejected"); error.status = 403; throw error;
  }
}
function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Vary", "Cookie, Origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
function cookies(req) {
  const raw = typeof req.headers.cookie === "string" ? req.headers.cookie.slice(0, 8192) : "";
  const map = {};
  for (const entry of raw.split(";")) {
    const i = entry.indexOf("=");
    if (i > 0) map[entry.slice(0, i).trim()] = entry.slice(i + 1).trim();
  }
  return map;
}
function cookie(res, name, value, maxAge) {
  const header = name + "=" + value + "; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=" + maxAge;
  const before = res.getHeader("Set-Cookie");
  res.setHeader("Set-Cookie", [...(Array.isArray(before) ? before : before ? [before] : []), header]);
}
function signedAttempt(token, secret) {
  return createHmac("sha256", secret).update("attempt\0" + token).digest("hex");
}
function attemptId(req, res, secret) {
  const raw = cookies(req)[ATTEMPT] || "";
  const [candidate, signature] = raw.split(".");
  if (TOKEN.test(candidate || "") && /^[a-f0-9]{64}$/.test(signature || "")) {
    const expected = signedAttempt(candidate, secret);
    if (timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) return candidate;
  }
  const token = randomBytes(32).toString("base64url");
  cookie(res, ATTEMPT, token + "." + signedAttempt(token, secret), 86400);
  return token;
}
function parseLogin(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  if (Object.keys(body).length !== 3 || body.action !== "login") return null;
  const n = body.attendanceNumber;
  const attendanceNumber = typeof n === "number" ? n : typeof n === "string" && /^\d{1,2}$/.test(n) ? Number(n) : NaN;
  if (!Number.isInteger(attendanceNumber) || !((attendanceNumber >= 1 && attendanceNumber <= 40) || attendanceNumber === 99)) return null;
  if (typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin)) return null;
  return {attendanceNumber, accountPin: body.pin};
}
function memberPayload(data) {
  const m = data?.member;
  if (!m || typeof m.id !== "string" || !/^[a-f0-9-]{36}$/i.test(m.id) ||
      typeof m.name !== "string" || m.name.length > 100) {
    throw new Error("Invalid KGS response");
  }
  return {id: m.id, name: m.name};
}
async function callKgs(path, payload, settings) {
  const headers = {
    "Authorization": "Bearer " + settings.secret,
    "Content-Type": "application/json",
    "Accept": "application/json"
  };
  const response = await fetch(settings.origin + "/api/integrations/weight/" + path, {
    method: "POST",
    redirect: "manual",
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000)
  });
  if (response.status >= 300 && response.status < 400) throw new Error("KGS is behind another login");
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error("Invalid KGS content type");
  if (Number(response.headers.get("content-length") || 0) > 16384) throw new Error("KGS response too large");
  const text = await response.text();
  if (text.length > 16384) throw new Error("KGS response too large");
  let data;
  try { data = JSON.parse(text); } catch { throw new Error("Invalid KGS JSON"); }
  return {status: response.status, data};
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") return json(res, 405, {error:"METHOD_NOT_ALLOWED"});
    const settings = config();
    if (req.method === "GET") {
      const token = cookies(req)[SESSION];
      if (!TOKEN.test(token || "")) return json(res, 200, {member:null});
      const result = await callKgs("verify", {token}, settings);
      if (result.status !== 200) {
        cookie(res, SESSION, "", 0);
        return json(res, 401, {member:null});
      }
      return json(res, 200, {member:memberPayload(result.data)});
    }
    requireSameOrigin(req);
    const data = req.body && typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}");
    if (data.action === "logout" && Object.keys(data).length === 1) {
      const token = cookies(req)[SESSION];
      cookie(res, SESSION, "", 0);
      if (TOKEN.test(token || "")) {
        try { await callKgs("logout", {token}, settings); } catch {/* Local logout is still enforced. */}
      }
      return json(res, 200, {ok:true});
    }
    const input = parseLogin(data);
    if (!input) return json(res, 400, {error:"出席番号と4桁PINを確認してください。"});
    const id = attemptId(req, res, settings.secret);
    const result = await callKgs("login", {...input, attemptId:id}, settings);
    if (result.status === 429) return json(res, 429, {error:"試行回数が多いため、しばらくしてからお試しください。"});
    if (result.status === 401) return json(res, 401, {error:"出席番号またはPINが違います。"});
    if (result.status !== 200 || !TOKEN.test(result.data?.token || "")) {
      return json(res, 503, {error:"KGSの認証を利用できません。"});
    }
    const member = memberPayload(result.data);
    // KGS holds the source-of-truth revocable session; never return its token in JSON.
    cookie(res, SESSION, result.data.token, MAX_AGE);
    return json(res, 200, {member});
  } catch (error) {
    if (error?.status === 403) return json(res, 403, {error:"この送信元から操作できません。"});
    return json(res, 503, {error:"KGSとの接続を確認してください。"});
  }
}

export {parseLogin, memberPayload, signedAttempt, toOrigin};
