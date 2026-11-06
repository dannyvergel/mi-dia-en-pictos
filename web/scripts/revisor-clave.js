// Genera REVISOR_CLAVE_HASH (scrypt) a partir de una contraseña que se lee por stdin. No guarda nada ni la muestra.
//   PowerShell 5.1 (en web/):  $clave = Read-Host "Contraseña"
//                              $clave | node scripts\revisor-clave.js
//                              Remove-Variable clave
//   bash:                      node scripts/revisor-clave.js   (escribila, Enter y Ctrl+D)
// En PowerShell 5.1 usá solo letras sin tilde, números y guiones: el pipe a node no respeta tildes ni eñes.
// Imprime una sola línea, el valor para cargar en Vercel como REVISOR_CLAVE_HASH. Ver docs/play/guia-danny.md.
const { hashClave } = require("../api/_lib/revisor");

let entrada = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", d => { entrada += d; });
process.stdin.on("end", async () => {
  // Saca el BOM y el salto de línea final (Get-Content y los editores los agregan); el resto de la contraseña queda igual.
  const clave = entrada.replace(/^\uFEFF/, "").replace(/\r?\n$/, "");
  if (clave.length < 12) { console.error("La contraseña tiene que tener al menos 12 caracteres."); process.exit(1); }
  if (clave.length > 200) { console.error("La contraseña puede tener hasta 200 caracteres."); process.exit(1); }
  if (/[\r\n]/.test(clave)) { console.error("La contraseña tiene que ser una sola línea."); process.exit(1); }
  process.stdout.write(await hashClave(clave) + "\n");
});
