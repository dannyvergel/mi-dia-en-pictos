// Herramientas del Agente de Progreso.
// Son funciones deterministas: el LLM decide cuáles usar y en qué orden,
// pero los números salen de acá (no los inventa el modelo).

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Base curada de prácticas basadas en evidencia (NCAEP 2020 / AFIRM, UNC).
const ESTRATEGIAS = [
  {
    id: "anticipacion",
    nombre: "Anticipación con agenda visual",
    practica_ebp: "Apoyos visuales (Visual Supports)",
    cuando: ["transicion", "recreo", "cambio", "imprevisto", "angustia", "ruido"],
    como: "Mostrar 5 minutos antes el pictograma de la actividad que viene y el de la estrategia de calma. Tachar o dar vuelta el picto cuando termina.",
    fuente: "NCAEP 2020 – Steinbrenner et al., práctica basada en evidencia: Visual Supports",
    url: "https://afirm.fpg.unc.edu/visual-supports"
  },
  {
    id: "antecedentes",
    nombre: "Ajuste del entorno antes del momento difícil",
    practica_ebp: "Intervenciones basadas en antecedentes (ABI)",
    cuando: ["ruido", "recreo", "sensorial", "patio", "multitud"],
    como: "Ofrecer los auriculares antes de salir al recreo largo (no después de la crisis) y acordar un rincón tranquilo como opción.",
    fuente: "NCAEP 2020 – Antecedent-Based Interventions",
    url: "https://afirm.fpg.unc.edu/antecedent-based-intervention"
  },
  {
    id: "historia_social",
    nombre: "Historia social del recreo",
    practica_ebp: "Narrativas sociales (Social Narratives)",
    cuando: ["recreo", "ruido", "angustia", "compañeros", "turnos"],
    como: "Leer el lunes a primera hora una historia corta con pictos: 'En el recreo hay ruido. Si me molesta, me pongo los auriculares o voy al rincón'.",
    fuente: "NCAEP 2020 – Social Narratives",
    url: "https://afirm.fpg.unc.edu/social-narratives"
  },
  {
    id: "caa_pedir",
    nombre: "Tarjeta 'necesito un descanso'",
    practica_ebp: "Entrenamiento en comunicación funcional (FCT) + CAA",
    cuando: ["angustia", "llanto", "pedir", "ayuda", "comunicacion", "descanso"],
    como: "Enseñar a entregar o tocar el picto 'descanso' para pedir salir del lugar, y responder siempre que lo use.",
    fuente: "NCAEP 2020 – Functional Communication Training / Augmentative and Alternative Communication",
    url: "https://afirm.fpg.unc.edu/functional-communication-training"
  },
  {
    id: "refuerzo",
    nombre: "Reforzar el logro en el momento",
    practica_ebp: "Refuerzo (Reinforcement)",
    cuando: ["autonomia", "comedor", "almorzar", "logro", "saludar", "avance"],
    como: "Nombrar el logro concreto en el acto ('¡comiste solo!') y sumar un picto de estrella en su agenda.",
    fuente: "NCAEP 2020 – Reinforcement",
    url: "https://afirm.fpg.unc.edu/reinforcement"
  },
  {
    id: "modelado",
    nombre: "Modelado entre pares",
    practica_ebp: "Modelado (Modeling)",
    cuando: ["saludar", "compañeros", "social", "interaccion", "jugar"],
    como: "Armar parejas con un compañero que modele el saludo y el juego por turnos en la última hora.",
    fuente: "NCAEP 2020 – Modeling",
    url: "https://afirm.fpg.unc.edu/modeling"
  }
];

const PICTO_CACHE = {};
async function picto(kw) {
  const k = (kw || "").toLowerCase().trim();
  if (!k) return null;
  if (k in PICTO_CACHE) return PICTO_CACHE[k];
  try {
    const r = await fetch("https://api.arasaac.org/api/pictograms/es/search/" + encodeURIComponent(k));
    const j = await r.json();
    const id = Array.isArray(j) && j.length ? j[0]._id : null;
    PICTO_CACHE[k] = id ? `https://static.arasaac.org/pictograms/${id}/${id}_500.png` : null;
  } catch { PICTO_CACHE[k] = null; }
  return PICTO_CACHE[k];
}

const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const diaSemana = f => DIAS[new Date(f + "T12:00:00").getDay()];
const textoDe = a => norm(`${a.actividad} ${a.palabra_clave}`);

function crearHerramientas(ctx) {
  const { alumno, registros = [], ppi = [], perfil = {} } = ctx;
  const delAlumno = registros.filter(r => r.alumno === alumno).sort((a, b) => a.fecha.localeCompare(b.fecha));

  return {
    leer_perfil: {
      descripcion: "Devuelve el perfil funcional del alumno: cómo se comunica, qué le molesta, qué lo calma y qué le gusta. No contiene diagnósticos. Usalo para personalizar las estrategias.",
      parametros: { type: "object", properties: {}, required: [] },
      run: () => {
        const p = Object.fromEntries(Object.entries(perfil).filter(([, v]) => v && String(v).trim()));
        return Object.keys(p).length ? { alumno, ...p } : { alumno, aviso: "Sin perfil cargado" };
      }
    },

    leer_historial: {
      descripcion: "Devuelve un resumen día por día de los registros del alumno (fecha, día de semana, ánimo, actividades difíciles, logros).",
      parametros: { type: "object", properties: {}, required: [] },
      run: () => ({
        alumno, total_dias: delAlumno.length,
        desde: delAlumno[0]?.fecha, hasta: delAlumno.at(-1)?.fecha,
        dias: delAlumno.map(r => ({
          fecha: r.fecha, dia: diaSemana(r.fecha), animo: r.animo_general,
          dificiles: (r.actividades || []).filter(a => a.estado === "dificil").map(a => `${a.hora || "?"} ${a.actividad}`),
          logros: r.logros || []
        }))
      })
    },

    analizar_patrones: {
      descripcion: "Cuenta momentos difíciles por día de la semana, por actividad y por franja horaria, y la evolución del ánimo por semana. Usala para encontrar patrones que se repiten.",
      parametros: { type: "object", properties: {}, required: [] },
      run: () => {
        const porDia = {}, diasHab = {}, porAct = {}, porHora = {};
        const animoSem = {};
        const VAL = { contento: 2, tranquilo: 1, cansado: 0, irritable: -1, angustiado: -2 };
        delAlumno.forEach((r, i) => {
          const d = diaSemana(r.fecha);
          diasHab[d] = (diasHab[d] || 0) + 1;
          const sem = "semana " + (Math.floor(i / 5) + 1);
          (animoSem[sem] ||= []).push(VAL[r.animo_general] ?? 0);
          let tuvo = false;
          for (const a of r.actividades || []) {
            if (a.estado !== "dificil") continue;
            tuvo = true;
            const k = norm(a.palabra_clave || a.actividad);
            porAct[k] = (porAct[k] || 0) + 1;
            const h = a.hora ? a.hora.slice(0, 2) + "h" : "sin hora";
            porHora[h] = (porHora[h] || 0) + 1;
          }
          if (tuvo) porDia[d] = (porDia[d] || 0) + 1;
        });
        const patrones = [];
        for (const d of Object.keys(diasHab)) {
          const n = porDia[d] || 0, t = diasHab[d];
          if (t >= 2 && n / t >= 0.6) patrones.push(`Días difíciles los ${d}: ${n} de ${t}`);
        }
        for (const [k, n] of Object.entries(porAct)) if (n >= 3) patrones.push(`La actividad '${k}' fue difícil ${n} veces`);
        const tendencia = Object.fromEntries(Object.entries(animoSem).map(([s, v]) => [s, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)]));
        return {
          dias_analizados: delAlumno.length,
          dias_dificiles_por_dia_semana: Object.fromEntries(Object.keys(diasHab).map(d => [d, `${porDia[d] || 0}/${diasHab[d]}`])),
          dificultades_por_actividad: porAct,
          dificultades_por_hora: porHora,
          animo_promedio_por_semana: tendencia,
          escala_animo: "2 contento · 1 tranquilo · 0 cansado · -1 irritable · -2 angustiado",
          patrones_detectados: patrones
        };
      }
    },

    evaluar_ppi: {
      descripcion: "Compara los registros con cada objetivo del PPI (Proyecto Pedagógico Individual) y devuelve la evidencia semana a semana.",
      parametros: { type: "object", properties: {}, required: [] },
      run: () => ppi.map(o => {
        const sem = {};
        delAlumno.forEach((r, i) => {
          const s = "semana " + (Math.floor(i / 5) + 1);
          sem[s] ||= { a_favor: 0, en_contra: 0 };
          const textos = [...(r.actividades || []).map(a => ({ t: textoDe(a), e: a.estado })), ...(r.logros || []).map(l => ({ t: norm(l), e: "bien" }))];
          for (const x of textos) {
            if (!o.palabras.some(p => x.t.includes(norm(p)))) continue;
            if (x.e === "bien") sem[s].a_favor++; else sem[s].en_contra++;
          }
        });
        const ss = Object.values(sem);
        const tasa = v => v.a_favor + v.en_contra ? v.a_favor / (v.a_favor + v.en_contra) : null;
        const ini = tasa(ss[0] || {}), fin = tasa(ss.at(-1) || {});
        let estado = "sin datos suficientes";
        if (ini !== null && fin !== null) estado = fin >= 0.9 && fin - ini >= 0.2 ? "logrado o casi logrado" : fin - ini >= 0.15 ? "avanzando" : fin - ini <= -0.15 ? "en retroceso" : fin < 0.5 ? "estancado" : "estable";
        return { objetivo: o.objetivo, evidencia_por_semana: sem, estado_calculado: estado };
      })
    },

    buscar_estrategias: {
      descripcion: "Busca en la base curada de prácticas basadas en evidencia (NCAEP 2020 / AFIRM) estrategias para un problema. Devuelve cómo aplicarlas y su fuente.",
      parametros: { type: "object", properties: { problema: { type: "string", description: "Palabras clave del problema, ej: 'recreo ruido angustia lunes'" } }, required: ["problema"] },
      run: ({ problema }) => {
        const p = norm(problema);
        return ESTRATEGIAS.map(e => ({ e, s: e.cuando.filter(c => p.includes(norm(c))).length }))
          .filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3)
          .map(({ e }) => ({ id: e.id, nombre: e.nombre, practica_ebp: e.practica_ebp, como: e.como, fuente: e.fuente, url: e.url }));
      }
    },

    armar_agenda: {
      descripcion: "Arma la agenda visual con pictogramas ARASAAC para un día, incluyendo los apoyos de anticipación que decidas.",
      parametros: {
        type: "object",
        properties: {
          dia: { type: "string", description: "Ej: 'lunes'" },
          pasos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                hora: { type: "string" },
                texto: { type: "string" },
                palabra_clave: { type: "string", description: "1 o 2 palabras simples en español para el pictograma" },
                es_apoyo: { type: "boolean", description: "true si es un apoyo agregado por el agente" }
              },
              required: ["texto", "palabra_clave"]
            }
          }
        },
        required: ["dia", "pasos"]
      },
      run: async ({ dia, pasos = [] }) => {
        const out = [];
        for (const p of pasos) out.push({ ...p, picto_url: await picto(p.palabra_clave) });
        ctx.agenda = { dia, pasos: out };
        return { ok: true, dia, pasos: out.length, sin_picto: out.filter(p => !p.picto_url).map(p => p.palabra_clave) };
      }
    }
  };
}

module.exports = { crearHerramientas, ESTRATEGIAS, diaSemana };
