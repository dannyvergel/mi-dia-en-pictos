// Datos de ejemplo FICTICIOS: 3 semanas de registros de Juan.
// Patrón escondido: los lunes el recreo largo (ruido) se le hace difícil.
// Avances: comer solo y saludar. Estancado: pedir ayuda con pictos.

const PPI = {
  Juan: [
    { objetivo: "Transitar el recreo con apoyos sin desregularse", palabras: ["recreo"] },
    { objetivo: "Comer con autonomía en el comedor", palabras: ["almorz", "comio", "comer", "comedor"] },
    { objetivo: "Saludar e iniciar interacción con compañeros", palabras: ["salud"] },
    { objetivo: "Pedir ayuda usando pictogramas (CAA)", palabras: ["pidio ayuda", "pedir ayuda", "picto de ayuda"] }
  ]
};
["Sofía", "Mateo", "Valentina"].forEach(n => PPI[n] = PPI.Juan.map(o => ({ ...o })));

function ultimosHabiles(n) {
  const out = [], d = new Date(); d.setHours(12);
  d.setDate(d.getDate() - 1);
  while (out.length < n) { const w = d.getDay(); if (w > 0 && w < 6) out.unshift(d.toISOString().slice(0, 10)); d.setDate(d.getDate() - 1); }
  return out;
}

function seedJuan() {
  const fechas = ultimosHabiles(15);
  return fechas.map((fecha, i) => {
    const sem = Math.floor(i / 5), dow = new Date(fecha + "T12:00:00").getDay();
    const lunes = dow === 1;
    const act = (hora, actividad, k, estado) => ({ hora, actividad, palabra_clave: k, estado });
    const a = [act("08:00", "Llegó a la escuela", "llegar", "bien"), act("08:30", "Desayunó", "desayunar", "bien")];
    a.push(dow === 5 ? act("09:00", "Educación física", "educación física", "bien") : act("09:00", "Música con instrumentos", "música", "bien"));
    a.push(lunes
      ? act("11:00", "Recreo largo: se angustió por el ruido del patio y lloró", "recreo", "dificil")
      : act("11:00", "Recreo, jugó en la arenera", "recreo", "bien"));
    const comida = sem === 0 ? (i % 2 ? act("12:00", "Almorzó poco, necesitó ayuda para comer", "almorzar", "dificil") : act("12:00", "Almorzó con ayuda", "almorzar", "regular"))
      : sem === 1 ? (i % 2 ? act("12:00", "Almorzó, usó la cuchara solo un rato", "almorzar", "bien") : act("12:00", "Almorzó con ayuda", "almorzar", "regular"))
      : act("12:00", "Almorzó y comió solo con la cuchara", "almorzar", "bien");
    a.push(comida);
    a.push(act("14:00", ["Pintó con témperas", "Leímos un cuento", "Juego de encastre"][i % 3], ["pintar", "leer", "jugar"][i % 3], "bien"));
    const saludo = sem === 2 || (sem === 1 && i % 2 === 0);
    a.push(act("15:00", saludo ? "Saludó solito a sus compañeros al irse" : "Se fue sin saludar", "saludar", saludo ? "bien" : "regular"));
    if (i === 7) a.splice(4, 0, act("11:40", "Pidió ayuda con el picto de ayuda para abrir la mochila", "pedir", "bien"));
    if (lunes) a.splice(4, 0, act("11:20", "No usó el picto para pedir ayuda, se calmó con auriculares", "pedir", "dificil"));
    const logros = [];
    if (sem === 2 && !lunes) logros.push("Comió solo con la cuchara");
    if (saludo && sem === 2) logros.push("Saludó a sus compañeros sin que se lo pidieran");
    return {
      alumno: "Juan", fecha, actividades: a,
      animo_general: lunes ? "angustiado" : sem === 0 ? "tranquilo" : "contento",
      logros, alertas: lunes ? [{ tipo: "conducta", detalle: "Angustia y llanto en el recreo largo por el ruido", nivel: "medio" }] : [],
      resumen_familia: "", registro_docente: a.map(x => `${x.hora} ${x.actividad}`).join(". "), ejemplo: true
    };
  });
}

// Perfil FUNCIONAL (sin diagnósticos ni datos de salud): lo que ayuda a planificar.
const PERFIL_VACIO = { comunicacion: "", sensibilidades: "", lo_calma: "", le_gusta: "", observaciones: "" };
const PERFILES_EJEMPLO = {
  Juan: {
    comunicacion: "Usa pocas palabras; señala y toca pictogramas. Entiende consignas cortas.",
    sensibilidades: "Ruido fuerte, patio lleno, cambios sin aviso",
    lo_calma: "Auriculares, rincón tranquilo, música suave",
    le_gusta: "Tocar el tambor, pintar con témperas, la arenera",
    observaciones: "Anticiparle los cambios con pictos le sirve."
  }
};
