// Lector del Padrón Oficial (XLSX → escuelas de Santa Fe), sobre un XLSX chiquito armado en memoria.
const test = require("node:test");
const assert = require("node:assert/strict");
const { leerXlsx, parsearPadron, aArchivo, desdeArchivo, numeroDe } = require("../scripts/padron");
const { padronDePrueba, xlsx } = require("./fixtures/xlsx");
const { describirOfertas, terminos } = require("../api/_lib/padron");

test("lee el XLSX: textos compartidos, números, celdas salteadas y acentos", () => {
  const filas = leerXlsx(xlsx({ 1: { 0: "Año", 2: "Pérez & Cía <b>" }, 3: { 1: 42 } }));
  assert.equal(filas[0][0], "Año"); assert.equal(filas[0][1], undefined); assert.equal(filas[0][2], "Pérez & Cía <b>");
  assert.equal(filas[1][1], "42");
});

test("filtra Santa Fe (CUE 82) con ofertas activas y arma cada escuela", () => {
  const { fecha, escuelas } = parsearPadron(leerXlsx(padronDePrueba()));
  assert.equal(fecha, "2026-09-07");
  assert.deepEqual(escuelas.map(e => e.cue), ["820060800", "820002100", "820446200", "820123400"]); // ni CABA ni la que no tiene ofertas
  const e = escuelas[0];
  assert.equal(e.nombre, "ESCUELA ESPECIAL NRO 2085 JUAN SALVADOR GAVIOTA");
  assert.equal(e.numero, "2085");
  assert.equal(e.domicilio, "CALLE 123 CENTRO"); // espacios normalizados
  assert.equal(e.localidad, "TOTORAS"); assert.equal(e.departamento, "ROSARIO"); assert.equal(e.cp, "S2000");
  assert.equal(e.email, "especial2085_rosario@santafe.edu.ar"); // solo emails válidos, en minúscula
  assert.equal(e.sector, "estatal"); assert.equal(e.ambito, "urbano");
  assert.deepEqual(e.ofertas, ["especial.integracion", "especial.primario", "especial.temprana"]);
  assert.equal(escuelas[1].sector, "privada");
  assert.deepEqual(escuelas[2].ofertas, ["comun.secundario"]);
  assert.equal(escuelas[3].cue, "820123400"); // CUE guardado como número en el XLSX
  assert.deepEqual(escuelas[3].ofertas, ["artistica", "comun.inicial"]);
});

test("formato compacto del archivo de datos: ida y vuelta, con fuente y fecha", () => {
  const datos = parsearPadron(leerXlsx(padronDePrueba()));
  const archivo = JSON.parse(JSON.stringify(aArchivo(datos, "https://ejemplo")));
  assert.equal(archivo.fecha_actualizacion, "2026-09-07");
  assert.match(archivo.fuente, /Padrón Oficial/); assert.match(archivo.licencia, /CC BY 4\.0/);
  assert.deepEqual(desdeArchivo(archivo).map(e => [e.cue, e.ofertas]), datos.escuelas.map(e => [e.cue, e.ofertas]));
});

test("un XLSX sin la fila de encabezados del padrón da un error claro", () => {
  assert.throws(() => parsearPadron(leerXlsx(xlsx({ 1: { 0: "otra cosa" } }))), /encabezados/);
  assert.throws(() => leerXlsx(Buffer.from("no soy un zip")), /XLSX/);
});

test("número de escuela, descripción de ofertas y términos de búsqueda", () => {
  assert.equal(numeroDe("E.E.S. ORIENTADA PART. INC. NRO 2040SANTA MARÍA"), "2040");
  assert.equal(numeroDe("Escuela N° 1234"), "1234");
  assert.equal(numeroDe("INSTITUTO SUPERIOR DE CINE"), null);
  assert.equal(describirOfertas(["especial.primario", "especial.temprana", "comun.inicial"]), "Educación Especial (primario, educación temprana) · Común (inicial)");
  assert.deepEqual(terminos("Escuela N.º 2085"), ["2085"]);
  assert.deepEqual(terminos("Escuela"), ["escuela"]);
  assert.deepEqual(terminos("  ROSÁRIO   Especial "), ["rosario", "especial"]);
});
