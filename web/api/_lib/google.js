// "Entrar con Google" (OpenID Connect, authorization code flow + PKCE) SOLO para docentes, directivos y la plataforma.
// Vive dentro de /api/auth (no suma funciones: el plan Hobby permite 12):
//   GET /api/auth?accion=google            → redirige a Google con state + nonce + PKCE guardados en una cookie HttpOnly firmada.
//   GET /api/auth?accion=google&code&state → callback (Google vuelve a la MISMA URL; se distingue por la presencia de code o error).
// Redirect URI registrada en Google Cloud: https://puentepictos.app/api/auth?accion=google (o GOOGLE_REDIRECT_URI).
// Reglas: scopes "openid email"; se valida state, nonce e id_token (aud, iss, exp, email_verified). El id_token llega directo
// del token endpoint de Google por TLS (OIDC Core 3.1.3.7: con eso no hace falta verificar la firma con JWKS).
// Solo entra un email que ya es de una docente activa (o ADMIN_EMAIL): NUNCA crea cuentas ni saltea invitaciones ni cupos.
// Familias no usan Google: siguen con link y código.
const crypto = require("crypto");
const S = require("./seguridad");
const { entrar, cuentaPara } = require("./identidad");
const auditoria = require("./auditoria");
const { uno } = require("./db");
const { consulta, urlPublica } = require("./http");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EMISORES = ["accounts.google.com", "https://accounts.google.com"];
const COOKIE = "puente_google";
const VIDA_SEG = 600; // 10 minutos para volver de Google
const VENTANA = 15, MAX_VERIF_IP = 30; // mismo límite (y misma clave) que verificar un código

const activo = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
// La URL exacta que se registra en Google Cloud. Se puede fijar con GOOGLE_REDIRECT_URI.
function redirectUri(req) {
  return (process.env.GOOGLE_REDIRECT_URI || "").trim() || urlPublica(req) + "/api/auth?accion=google";
}

const azar = () => crypto.randomBytes(32).toString("base64url");
const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
function cookieEstado(valor, maxAge) {
  return `${COOKIE}=${valor}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function leerEstado(req) {
  const v = S.leerCookies(req)[COOKIE];
  if (!v) return null;
  const [datos, firma] = String(v).split(".");
  if (!datos || !firma || !S.igualSeguro(firma, S.hmac("google:" + datos))) return null;
  try {
    const o = JSON.parse(Buffer.from(datos, "base64url").toString());
    if (!o.s || !o.n || !o.v || !o.t || Date.now() - o.t > VIDA_SEG * 1000 || o.t - Date.now() > 60e3) return null;
    return o;
  } catch { return null; }
}

// Adónde vuelve el navegador (siempre a login.html: con sesión, login.html lo manda a su panel).
function irA(res, destino, cookies = []) {
  cookies = [...cookies, cookieEstado("", 0)]; // la cookie de estado es de un solo uso
  res.setHeader("Set-Cookie", cookies);
  res.setHeader("Location", destino);
  res.status(302);
  return res.end();
}
const aLogin = (codigo, volver) => "/login.html?" + new URLSearchParams({ ...(volver ? { volver } : {}), ...(codigo ? { google: codigo } : {}) });

function inicio(req, res) {
  if (!activo()) { res.setHeader("Location", "/login.html"); res.status(302); return res.end(); }
  const st = { s: azar(), n: azar(), v: azar(), t: Date.now(), ...(consulta(req, "volver") === "cuaderno" ? { r: "cuaderno" } : {}) };
  const datos = b64(st);
  const challenge = crypto.createHash("sha256").update(st.v).digest("base64url");
  const url = AUTH_URL + "?" + new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirectUri(req), response_type: "code",
    scope: "openid email", state: st.s, nonce: st.n, code_challenge: challenge, code_challenge_method: "S256",
    prompt: "select_account"
  });
  res.setHeader("Set-Cookie", cookieEstado(`${datos}.${S.hmac("google:" + datos)}`, VIDA_SEG));
  res.setHeader("Location", url);
  res.status(302);
  return res.end();
}

// Lee el payload de un JWT (sin verificar firma: solo se usa con el id_token recibido del token endpoint por TLS).
function payloadJwt(t) {
  const partes = String(t || "").split(".");
  if (partes.length !== 3) return null;
  try { return JSON.parse(Buffer.from(partes[1], "base64url").toString()); } catch { return null; }
}

// Valida los claims del id_token. Devuelve el email normalizado o null.
function emailDeIdToken(idToken, nonce, ahora = Date.now()) {
  const p = payloadJwt(idToken);
  if (!p) return null;
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  if (!aud.includes(process.env.GOOGLE_CLIENT_ID)) return null;
  if (Array.isArray(p.aud) && p.aud.length > 1 && p.azp !== process.env.GOOGLE_CLIENT_ID) return null;
  if (!EMISORES.includes(p.iss)) return null;
  if (typeof p.exp !== "number" || p.exp * 1000 <= ahora) return null;
  if (typeof p.nonce !== "string" || !S.igualSeguro(p.nonce, nonce)) return null;
  if (p.email_verified !== true && p.email_verified !== "true") return null;
  const email = S.normEmail(p.email);
  return S.emailValido(email) ? email : null;
}

async function callback(req, res) {
  const st = leerEstado(req);
  const volver = st?.r || null;
  const state = String(consulta(req, "state") || "");
  if (!activo()) return irA(res, aLogin("error"));
  if (!st || !state || !S.igualSeguro(state, st.s)) return irA(res, aLogin("error", volver));
  if (consulta(req, "error")) return irA(res, aLogin("cancelado", volver));
  const kI = "verif:ip:" + S.ipDe(req);
  if (await S.superaLimite(kI, MAX_VERIF_IP, VENTANA)) return irA(res, aLogin("limite", volver));
  await S.registrarIntento(kI);

  let tokens;
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ code: String(consulta(req, "code") || ""), client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri(req), grant_type: "authorization_code", code_verifier: st.v }).toString()
    });
    tokens = r.ok ? await r.json() : null;
    if (!r.ok) console.error("[puente] google token endpoint:", r.status);
  } catch (e) { console.error("[puente] google token endpoint:", e.message); }
  const email = tokens?.id_token ? emailDeIdToken(tokens.id_token, st.n) : null;
  if (!email) return irA(res, aLogin("error", volver));

  // Solo cuentas que ya existen y pueden entrar (docente activa de escuela activa, o ADMIN_EMAIL). Nunca se crea nada.
  const cookies = [];
  const captura = { setHeader(k, v) { if (String(k).toLowerCase() === "set-cookie") cookies.push(...[].concat(v)); } };
  const sesion = await entrar(captura, "docente", email, "sso:google");
  if (!sesion) {
    await auditoria.loginFallido(req, "docente", email);
    return irA(res, aLogin("sin_acceso", volver));
  }
  const cuenta = await cuentaPara("docente", email);
  await auditoria.registrar(req, { evento: "login_google", actor_tipo: "docente", actor_id: cuenta?.id, email,
    escuela_id: (await uno("SELECT escuela_id FROM docentes WHERE id = $1", [cuenta?.id || 0]))?.escuela_id, detalle: { metodo: "google" } });
  return irA(res, volver ? aLogin(null, volver) : "/login.html", cookies);
}

// GET /api/auth?accion=google: sin code/error/state es el inicio; con ellos, el callback.
function manejar(req, res) {
  if (consulta(req, "code") || consulta(req, "error") || consulta(req, "state")) return callback(req, res);
  return inicio(req, res);
}

module.exports = { activo, redirectUri, manejar, emailDeIdToken, COOKIE };
