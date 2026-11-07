// Entorno de ejecución, sin acoplar el código a Vercel.
//   appEnv():    APP_ENV si está definida, si no VERCEL_ENV, si no "development".
//                Valores que el código distingue: "production" (SESSION_SECRET obligatorio, sin códigos en las respuestas, salud
//                exige base) y "preview" (los códigos solo van al log). Cualquier otro valor se trata como no productivo
//                pero tampoco devuelve códigos en la respuesta (ver correo.js).
//   appCommit(): APP_COMMIT si está definida, si no VERCEL_GIT_COMMIT_SHA, si no "".
// Con solo VERCEL_ENV / VERCEL_GIT_COMMIT_SHA (Vercel) el resultado es el de siempre.
const valor = v => typeof v === "string" && v.trim() !== "" ? v.trim() : "";

function appEnv(env = process.env) {
  return valor(env.APP_ENV) || valor(env.VERCEL_ENV) || "development";
}

function appCommit(env = process.env) {
  return valor(env.APP_COMMIT) || valor(env.VERCEL_GIT_COMMIT_SHA);
}

module.exports = { appEnv, appCommit };
