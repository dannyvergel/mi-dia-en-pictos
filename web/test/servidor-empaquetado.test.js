// Static checks of the self-hosting bundle (no Docker needed): compose, Dockerfile, .env.example and Caddyfile stay consistent.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "..");
const leer = f => fs.readFileSync(path.join(RAIZ, f), "utf8");
const compose = leer("docker-compose.yml");
const envEjemplo = leer(".env.example");

test("every variable compose requires with ${VAR:?...} is named in .env.example", () => {
  const requeridas = [...compose.matchAll(/\$\{([A-Z_]+):\?/g)].map(m => m[1]);
  assert.ok(requeridas.length >= 4);
  for (const v of new Set(requeridas)) assert.match(envEjemplo, new RegExp("^" + v + "=", "m"), v);
});

test(".env.example holds placeholders only: no secret has a value", () => {
  for (const v of ["DB_PASSWORD", "SESSION_SECRET", "CRON_SECRET", "ADMIN_EMAIL", "DOCENTE_PIN"]) {
    assert.match(envEjemplo, new RegExp("^" + v + "=$", "m"), v);
  }
  assert.ok(!/(sk-|re_|BEGIN [A-Z ]*PRIVATE)/.test(envEjemplo));
});

test("compose defaults: production, pg, disk storage, trusted proxy; app port not published", () => {
  for (const l of ["APP_ENV: production", "DB_DRIVER: pg", "STORAGE_DRIVER: disk", 'TRUST_PROXY: "1"']) assert.ok(compose.includes(l), l);
  const app = compose.split(/\n  db:/)[0];
  assert.ok(!/^\s+ports:/m.test(app), "app must not publish ports");
  assert.ok(/expose:\s*\n\s+- "3000"/.test(app));
  assert.ok(/condition: service_healthy/.test(app));
});

test("llm service is optional (profile) and nothing else uses that profile", () => {
  const llm = compose.split(/\n  llm:/)[1].split(/\nvolumes:/)[0];
  assert.match(llm, /profiles: \["llm"\]/);
  assert.equal((compose.match(/profiles:/g) || []).length, 1);
});

test("Dockerfile: node 22 alpine, non-root, healthcheck on the health endpoint, prod install", () => {
  const d = leer("Dockerfile");
  assert.match(d, /^FROM node:22-alpine/m);
  assert.match(d, /^USER node/m);
  assert.ok(d.includes("npm ci --omit=dev"));
  assert.match(d, /HEALTHCHECK[\s\S]*\/api\/config\?accion=salud/);
});

test(".dockerignore keeps secrets and tests out of the image but not the data the server needs", () => {
  const i = leer(".dockerignore").split(/\r?\n/);
  for (const l of [".env", ".git", "web/test", "**/node_modules"]) assert.ok(i.includes(l), l);
  assert.ok(!i.includes("web/data") && !i.includes("**/data"), "web/data/escuelas-santa-fe.json is required at runtime");
});

test("Caddyfile overwrites X-Forwarded-For and fronts the app service", () => {
  const c = leer("docker/Caddyfile");
  assert.ok(c.includes("{$PUENTE_DOMAIN}"));
  assert.ok(c.includes("reverse_proxy app:3000"));
  assert.ok(c.includes("header_up X-Forwarded-For {remote_host}"));
});
