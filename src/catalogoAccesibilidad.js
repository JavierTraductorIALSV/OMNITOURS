import React from 'react';

// Catálogo de preguntas de la auditoría y cálculo de accesibilidad por tipo de
// discapacidad. Vive fuera de App.js porque lo consumen tanto el flujo de
// empresas/admin como el portal de discapacidad.

const baseModules = [
  { id: 'm1-1', title: 'Acceso y Circulación', description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple)', questions: [
    { id: 'm1_1', text: 'Acceso: ¿Existen rampas con pendiente adecuada (máx. 6-8%) y pasamanos?', cat: 'Motora', max: 2 },
    { id: 'm1_2', text: 'Circulación: ¿Los pasillos y puertas tienen un ancho mínimo de 90 cm?', cat: 'Motora', max: 2 },
    { id: 'm1_3', text: 'Sanitarios: ¿Hay barras de apoyo, espacio de giro para silla de ruedas y grifería de palanca?', cat: 'Motora', max: 2 },
    { id: 'm1_4', text: 'Mobiliario: ¿Existen mesas o mostradores con altura adecuada para usuarios en silla de ruedas?', cat: 'Motora', max: 2 },
    { id: 'm1_5', text: 'Señalética: ¿Hay cartelería en Braille y alto relieve en puntos clave?', cat: 'Visual', max: 2 },
    { id: 'm1_6', text: 'Pavimento: ¿Existe suelo podotáctil en zonas de cambio de nivel o entradas?', cat: 'Visual', max: 2 }
  ]},
  { id: 'm1-2', title: 'Iluminación, Acústica y Alertas', description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple)', questions: [
    { id: 'm1_7', text: 'Iluminación: ¿Los espacios están bien iluminados y sin reflejos?', cat: 'Visual', max: 2 },
    { id: 'm1_8', text: 'Obstáculos: ¿Pasillos libres de objetos salientes no detectables con bastón?', cat: 'Visual', max: 2 },
    { id: 'm1_9', text: 'Alertas: ¿Existen alarmas de emergencia visuales (luces estroboscópicas)?', cat: 'Auditiva', max: 2 },
    { id: 'm1_10', text: 'Información: ¿Hay pantallas informativas visibles para avisos o turnos?', cat: 'Auditiva', max: 2 },
    { id: 'm1_11', text: 'Acústica: ¿El diseño reduce el eco para facilitar audífonos?', cat: 'Auditiva', max: 2 },
    { id: 'm1_12', text: 'Señalética Cognitiva: ¿Se usan pictogramas universales?', cat: 'Neurodiversidad', max: 2 }
  ]},
  { id: 'm1-3', title: 'Neurodiversidad y Confort', description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple)', questions: [
    { id: 'm1_13', text: 'Wayfinding: ¿Diseño intuitivo o líneas de color en suelo/paredes?', cat: 'Neurodiversidad', max: 2 },
    { id: 'm1_14', text: 'Lectura Fácil: ¿Menús, folletos o reglamentos en formato Lectura Fácil?', cat: 'Neurodiversidad', max: 2 },
    { id: 'm1_15', text: 'Zonas de Calma: ¿Área tranquila de baja estimulación sensorial?', cat: 'Neurodiversidad', max: 2 },
    { id: 'm1_16', text: 'Confort: ¿Se evita luces fluorescentes parpadeantes o música excesiva?', cat: 'Neurodiversidad', max: 2 },
    { id: 'm1_17', text: 'Previsibilidad: ¿Información previa con fotos y qué esperar?', cat: 'Neurodiversidad', max: 2 },
    { id: 'm1_18', text: 'Identificación: ¿Facilitan identificadores de discapacidad invisible?', cat: 'Neurodiversidad', max: 2 }
  ]},
  { id: 'm2', title: 'Conocimientos y Herramientas para la Atención', description: 'Escala: 0 (Nulo) / 1 (Básico) / 2 (Bueno) / 3 (Excelente)', questions: [
    { id: 'm2_1', text: 'Lenguaje: ¿El personal conoce términos correctos (ej. "persona con discapacidad")?', cat: 'Protocolo', max: 3 },
    { id: 'm2_2', text: 'Autonomía: ¿Saben que deben preguntar antes de ayudar y dirigirse siempre al usuario?', cat: 'Protocolo', max: 3 },
    { id: 'm2_3', text: 'Motora: ¿Saben asistir en el empuje de una silla de ruedas o ubicar a la persona?', cat: 'Motora', max: 3 },
    { id: 'm2_4', text: 'Visual: ¿Saben ofrecer el brazo como guía y describir el entorno usando referencias de reloj?', cat: 'Visual', max: 3 },
    { id: 'm2_5', text: 'Auditiva: ¿Conocen técnicas básicas (hablar de frente, vocalizar claro y manejo básico de LSV)?', cat: 'Auditiva', max: 3 },
    { id: 'm2_6', text: 'Cognitiva: ¿Saben usar lenguaje sencillo, dar instrucciones paso a paso y tener paciencia?', cat: 'Cognitiva', max: 3 }
  ]},
  { id: 'm3', title: 'Ayudas Técnicas (1/2)', description: 'Escala: 0 (No cuenta) / 1 (Mantenimiento) / 2 (Disponible)', questions: [
    { id: 'm3_1', text: 'Movilidad interna: ¿Sillas de ruedas propias para préstamo?', cat: 'Motora', max: 2 },
    { id: 'm3_2', text: 'Transferencia: ¿Sillas de ducha o grúas en habitaciones adaptadas?', cat: 'Motora', max: 2 },
    { id: 'm3_3', text: 'Elevación: ¿Plataformas elevadoras donde no hay rampas?', cat: 'Motora', max: 2 },
    { id: 'm3_4', text: 'Documentación: ¿Menús en Braille o macrotipos?', cat: 'Visual', max: 2 },
    { id: 'm3_5', text: 'Tecnología QR: ¿Códigos QR para audiodescripciones?', cat: 'Visual', max: 2 },
    { id: 'm3_6', text: 'Asistencia Animal: ¿Kits para perros guía?', cat: 'Visual', max: 2 }
  ]},
  { id: 'm3-2', title: 'Ayudas Técnicas (2/2)', description: 'Escala: 0 (No cuenta) / 1 (Mantenimiento) / 2 (Disponible)', questions: [
    { id: 'm3_7', text: 'Bucle Magnético: ¿En mostrador o sala?', cat: 'Auditiva', max: 2 },
    { id: 'm3_8', text: 'Sistemas de Aviso: ¿Dispositivos portátiles de vibración?', cat: 'Auditiva', max: 2 },
    { id: 'm3_9', text: 'Comunicación Visual: ¿Tablets para video-interpretación LSV?', cat: 'Auditiva', max: 2 },
    { id: 'm3_10', text: 'Kits Sensoriales: ¿Mochilas de calma?', cat: 'Neurodiversidad', max: 2 },
    { id: 'm3_11', text: 'Apoyos Visuales: ¿Tableros de comunicación con pictogramas?', cat: 'Neurodiversidad', max: 2 },
    { id: 'm3_12', text: 'Mapas Sensoriales: ¿Mapa con zonas de ruido/silencio?', cat: 'Neurodiversidad', max: 2 }
  ]},
  { id: 'm4', title: 'Tecnologías de Apoyo', description: 'Escala: 0 (Inexistente) / 1 (Básica) / 2 (Adaptada) / 3 (Integral)', questions: [
    { id: 'm4_1', text: 'Accesibilidad Web: ¿Cumple la página web o app con las pautas WCAG?', cat: 'Digital', max: 3 },
    { id: 'm4_2', text: 'Tecnología Tiflotécnica: ¿Audiodescripción, Navilens o Beacons?', cat: 'Visual', max: 3 },
    { id: 'm4_3', text: 'Tecnología de Comunicación: ¿Video-interpretación o sistemas de inducción?', cat: 'Auditiva', max: 3 },
    { id: 'm4_4', text: 'Apoyos Cognitivos: ¿Realidad Aumentada o Lectura Fácil?', cat: 'Neurodiversidad', max: 3 },
    { id: 'm4_5', text: 'Domótica: ¿Control por voz o móvil?', cat: 'Motora', max: 3 }
  ]},
  { id: 'm5', title: 'Gestión de Emergencias', description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple)', questions: [
    { id: 'm5_1', text: 'Evacuación: ¿Conoce el personal el protocolo para evacuar a personas con discapacidad?', cat: 'Seguridad', max: 2 }
  ]}
];

const sectorSpecificQuestions = {
  restaurante: [
    { id: 'R-ESP-01', text: 'Menú Especial: ¿Ofrece un menú especial para personas con celiaquía o alergias alimentarias, con opciones claramente identificadas y sin riesgo de contaminación cruzada?', cat: 'Neurodiversidad', max: 2 },
    { id: 'R-ESP-02', text: 'Espacio Reservado: ¿Cuenta con un espacio reservado y claramente señalizado para personas con discapacidad (motora, visual, etc.) que garantice comodidad y accesibilidad?', cat: 'Motora', max: 2 },
    { id: 'R-ESP-03', text: 'Protocolo de Emergencia: ¿El personal conoce y aplica un protocolo específico para la atención y evacuación de personas con discapacidad en caso de emergencia?', cat: 'Seguridad', max: 2 },
    { id: 'R-ESP-04', text: 'Ayudas Técnicas (mesas/sillas): ¿Dispone de mesas y sillas adaptadas para personas con discapacidad motora (ej. altura regulable, sillas con brazos, sin barreras)?', cat: 'Motora', max: 2 },
    { id: 'R-ESP-05', text: 'Señalización Inclusiva: ¿La señalización (menús, cartas, baños) cuenta con elementos visuales (pictogramas), táctiles (braille/relieve) y/o vibrotáctiles?', cat: 'Visual', max: 2 },
    { id: 'R-ESP-06', text: 'Comunicación en el Servicio: ¿El personal está capacitado para comunicarse con personas con discapacidad auditiva (ej. uso de mímica, comunicación escrita, LSV básico)?', cat: 'Auditiva', max: 3 },
    { id: 'R-ESP-07', text: 'Indicaciones claras del personal de atención a usuarios con discapacidad: ¿Las explicaciones son claras y se desarrollan con tiempo suficiente para atender adecuadamente al usuario con discapacidad?', cat: 'Neurodiversidad', max: 2 }
  ],
  agencia: [
    { id: 'A-ESP-01', text: 'Accesibilidad Web: ¿El sitio web y la app de la agencia cumplen con estándares de accesibilidad (WCAG) para ser navegados por personas con discapacidad visual o motora?', cat: 'Digital', max: 3 },
    { id: 'A-ESP-02', text: 'Información en Varios Formatos: ¿La información sobre paquetes turísticos está disponible en formatos accesibles (lectura fácil, braille, audio, macrotipos)?', cat: 'Visual', max: 2 },
    { id: 'A-ESP-03', text: 'Atención Personalizada: ¿Ofrecen un servicio de atención al cliente específico para asesorar a personas con discapacidad sobre la accesibilidad de los destinos y servicios?', cat: 'Protocolo', max: 3 },
    { id: 'A-ESP-04', text: 'Comunicación Telefónica: ¿Cuentan con sistemas de atención telefónica accesibles para personas con discapacidad auditiva (ej. chat, mensajería instantánea, video-llamada)?', cat: 'Auditiva', max: 2 }
  ],
  transporte: [
    { id: 'T-ESP-01', text: 'Identificación: ¿El vehículo cuenta con el logo o identificación visible de "accesible" o "persona con discapacidad"?', cat: 'Visual', max: 2 },
    { id: 'T-ESP-02', text: 'Acceso (Rampa/Elevador): ¿El vehículo dispone de una rampa o plataforma elevadora en buen estado para el acceso de sillas de ruedas?', cat: 'Motora', max: 2 },
    { id: 'T-ESP-03', text: 'Espacio Interior: ¿El vehículo cuenta con un espacio reservado y debidamente anclado para que una silla de ruedas pueda viajar de forma segura?', cat: 'Motora', max: 2 },
    { id: 'T-ESP-04', text: 'Asientos Preferentes: ¿Existen asientos específicos, señalizados con el logo de discapacidad, para personas con discapacidad o movilidad reducida?', cat: 'Motora', max: 2 },
    { id: 'T-ESP-05', text: 'Atención Preferencial: ¿El conductor o asistente está capacitado para brindar atención preferencial y asistencia durante el abordaje y viaje?', cat: 'Protocolo', max: 2 },
    { id: 'T-ESP-06', text: 'Información Abordo: ¿La información (rutas, paradas, anuncios) se ofrece de forma visual (pantallas) y auditiva (megafonía clara)?', cat: 'Auditiva', max: 2 },
    { id: 'T-ESP-07', text: 'Manejo de lenguaje inclusivo: ¿El personal a bordo cuenta con los conocimientos técnicos pertinentes para explicar cualquier término que no se conozca por parte de los usuarios con discapacidad?', cat: 'Auditiva', max: 2 }
  ],
  museo: [
    { id: 'M-ESP-01', text: 'Atención Preferencial: ¿Ofrece un servicio de atención preferencial para personas con discapacidad (ej. entrada gratuita, cola prioritaria, visitas guiadas especializadas)?', cat: 'Protocolo', max: 2 },
    { id: 'M-ESP-02', text: 'Ayudas Técnicas para la Visita: ¿Dispone de ayudas técnicas como sillas de ruedas, maquetas táctiles, bucles magnéticos o tablets con LSV para la visita?', cat: 'Motora', max: 2 },
    { id: 'M-ESP-03', text: 'Recursos Tiflotécnicos: ¿Las obras o piezas clave cuentan con réplicas táctiles, descripciones en braille o audio-guías descriptivas?', cat: 'Visual', max: 2 },
    { id: 'M-ESP-04', text: 'Visitas Sensoriales: ¿Se ofrecen visitas en horarios de baja estimulación para personas con autismo o sensibilidad sensorial?', cat: 'Neurodiversidad', max: 2 },
    { id: 'M-ESP-05', text: 'Manejo de lenguaje inclusivo: ¿El personal a cargo cuenta con los conocimientos técnicos pertinentes para explicar cualquier término que no se conozca por parte de los usuarios con discapacidad?', cat: 'Auditiva', max: 2 }
  ],
  aereo: [
    { id: 'TA-ESP-01', text: 'Procedimiento de Asistencia: ¿La aerolínea/aeropuerto ofrece un servicio de asistencia desde el check-in hasta el embarque y desembarque para personas con discapacidad?', cat: 'Motora', max: 3 },
    { id: 'TA-ESP-02', text: 'Silla de Ruedas en Aeropuerto: ¿Dispone de sillas de ruedas para el traslado dentro de la terminal y para el embarque/desembarque?', cat: 'Motora', max: 2 },
    { id: 'TA-ESP-03', text: 'Comunicación de Emergencia: ¿La información de seguridad previa al vuelo se ofrece en formatos accesibles (visual, braille, LSV)?', cat: 'Visual', max: 2 },
    { id: 'TA-ESP-04', text: 'Sanitario Accesible en Vuelo: En vuelos de largo alcance, ¿el sanitario de la aeronave es accesible para personas con movilidad reducida?', cat: 'Motora', max: 2 },
    { id: 'TA-ESP-05', text: 'Lenguaje inclusivo: ¿El personal a cargo del vuelo maneja lenguaje inclusivo para personas con discapacidad (Lengua de Señas, terminologías fácilmente comprensibles)?', cat: 'Todas', max: 3 }
  ],
  recreacional: [
    { id: 'REC-ESP-01', text: 'Plan de Atención Inclusivo: ¿Las actividades recreativas están diseñadas con un plan que permite la participación de personas con todo tipo de discapacidad?', cat: 'Protocolo', max: 2 },
    { id: 'REC-ESP-02', text: 'Materiales y Productos Inclusivos: ¿Los materiales y productos utilizados (juegos, utensilios, etc.) son accesibles y adaptables?', cat: 'Motora', max: 2 },
    { id: 'REC-ESP-03', text: 'Personal Capacitado: ¿El personal encargado de las actividades está capacitado para incluir y atender a personas con discapacidad en las dinámicas?', cat: 'Protocolo', max: 3 },
    { id: 'REC-ESP-04', text: 'Atracciones Accesibles: ¿Las atracciones principales son accesibles o tienen alternativas para personas con discapacidad motora?', cat: 'Motora', max: 2 }
  ],
  playa: [
    { id: 'PLA-ESP-01', text: 'Acceso a la Playa: ¿Existe un camino o pasarela accesible (ej. de madera o caucho) que permita el acceso desde la entrada hasta la orilla para sillas de ruedas?', cat: 'Motora', max: 2 },
    { id: 'PLA-ESP-02', text: 'Zona Reservada: ¿Hay un espacio reservado y señalizado en la arena, cercano al agua, para personas con discapacidad severa o motora?', cat: 'Motora', max: 2 },
    { id: 'PLA-ESP-03', text: 'Toldo Adaptado: ¿Los toldos o sombrillas reservadas tienen altura y espacio suficiente para una silla de ruedas?', cat: 'Motora', max: 2 },
    { id: 'PLA-ESP-04', text: 'Ducha Accesible: ¿La ducha de la playa es accesible (sin escalones, con espacio de giro y asiento)?', cat: 'Motora', max: 2 },
    { id: 'PLA-ESP-05', text: 'Baño Accesible: ¿El servicio de baño es accesible (barras de apoyo, espacio, grifería de palanca)?', cat: 'Motora', max: 2 },
    { id: 'PLA-ESP-06', text: 'Seguridad y Salvamento: ¿El equipo de seguridad y salvamento cuenta con protocolos y equipos para atender emergencias con personas con discapacidad?', cat: 'Seguridad', max: 2 },
    { id: 'PLA-ESP-07', text: 'Ayudas Técnicas Acuáticas: ¿Ofrecen sillas de ruedas anfibias o muletas para el agua para facilitar el baño?', cat: 'Motora', max: 2 },
    { id: 'PLA-ESP-08', text: 'Lenguaje inclusivo: ¿El personal salvavidas o de seguridad maneja lenguaje inclusivo para personas con discapacidad (Lengua de Señas, terminologías fácilmente comprensibles)?', cat: 'Todas', max: 2 }
  ]
};

const sectorModulesConfig = {
  alojamiento: ['m1-1', 'm1-2', 'm1-3', 'm2', 'm3', 'm3-2', 'm4', 'm5'],
  restaurante: ['m1-1', 'm1-2', 'm1-3', 'm2', 'm3', 'm3-2', 'm4', 'm5'],
  agencia: ['m1-1', 'm1-2', 'm1-3', 'm2', 'm3', 'm3-2', 'm4'],
  transporte: ['m1-1', 'm1-2', 'm2', 'm5'],
  museo: ['m1-1', 'm1-2', 'm1-3', 'm2', 'm3', 'm3-2', 'm4', 'm5'],
  aereo: ['m1-1', 'm1-2', 'm2', 'm3', 'm3-2', 'm5'],
  recreacional: ['m1-1', 'm1-2', 'm1-3', 'm2', 'm3', 'm3-2', 'm4', 'm5'],
  playa: ['m1-1', 'm2', 'm5']
};

export const getModulesBySector = (sectorId) => {
  if (!sectorId) return [];
  const moduleIds = sectorModulesConfig[sectorId] || [];
  const modules = [];
  for (const id of moduleIds) {
    const base = baseModules.find(m => m.id === id);
    if (base) modules.push({ ...base });
  }
  const specificQuestions = sectorSpecificQuestions[sectorId] || [];
  if (specificQuestions.length > 0) {
    modules.push({
      id: 'sector-especifico',
      title: `Preguntas Específicas del Sector`,
      description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple) / 3 (Excelente)',
      questions: specificQuestions,
      isSpecific: true
    });
  }
  return modules;
};

// Grupos que se muestran al usuario. "Psicosocial" queda fuera a propósito: el
// catálogo no tiene ninguna pregunta psicosocial y ponerle un porcentaje sería
// inventarlo. Neurodiversidad sí está medida pero no tiene logo asignado, así
// que su ficha se renderiza solo con texto.
const REGEX_LSV = /LSV|lengua de señas|señas/i;

export const GRUPOS_DISCAPACIDAD = [
  { id: 'motora', label: 'Motora', logo: '/logo-motora.png', cats: ['Motora'] },
  { id: 'visual', label: 'Visual', logo: '/logo-visual.jpg', cats: ['Visual'] },
  { id: 'auditiva', label: 'Auditiva', logo: '/logo-auditiva.jpg', cats: ['Auditiva'] },
  { id: 'cognitiva', label: 'Cognitiva', logo: '/logo-cognitiva.png', cats: ['Cognitiva'] },
  { id: 'lsv', label: 'Lengua de señas', logo: '/logo-lengua-senas.png', lsv: true },
  { id: 'neurodiversidad', label: 'Neurodiversidad', logo: null, cats: ['Neurodiversidad'] }
];

// Una pregunta puede contar en más de un grupo (m2_5 es Auditiva y también de
// lengua de señas): son lentes distintos sobre la misma auditoría, no particiones.
// El denominador usa solo las preguntas con respuesta guardada: hay empresas
// antiguas auditadas con otro juego de módulos y contar como 0 las que nunca se
// les preguntó inventaría un incumplimiento. Si el grupo no tiene ninguna
// respuesta el porcentaje sale null (la ficha muestra "—"), no 0.
export const calcularPorcentajesPorDiscapacidad = (sector, respuestasMap) => {
  const modulos = getModulesBySector(sector);
  const respuestas = respuestasMap || {};
  return GRUPOS_DISCAPACIDAD.map(grupo => {
    let score = 0, max = 0, n = 0, respondidas = 0;
    modulos.forEach(mod => mod.questions.forEach(q => {
      const aplica = grupo.lsv ? REGEX_LSV.test(q.text) : (grupo.cats || []).includes(q.cat);
      if (!aplica) return;
      n += 1;
      const s = respuestas[q.id];
      if (typeof s === 'number') {
        respondidas += 1;
        score += s;
        max += q.max;
      }
    }));
    return {
      ...grupo,
      n,
      respondidas,
      pct: respondidas === 0 || max === 0 ? null : Math.round((score / max) * 100)
    };
  });
};

export const coberturaAuditoria = (sector, respuestasMap) => {
  const respuestas = respuestasMap || {};
  const preguntas = getModulesBySector(sector).flatMap(m => m.questions);
  return {
    total: preguntas.length,
    respondidas: preguntas.filter(q => typeof respuestas[q.id] === 'number').length
  };
};

export const FichasPorDiscapacidad = ({ grupos, empresa, cobertura }) => (
  <div>
    <div
      role="group"
      aria-label={`Accesibilidad por tipo de discapacidad${empresa ? ` de ${empresa}` : ''}`}
      className="grid grid-cols-3 gap-1.5"
    >
      {grupos.map(g => (
        <div
          key={g.id}
          title={
            g.n === 0
              ? `${g.label}: este sector no tiene preguntas de ese tipo`
              : g.pct === null
                ? `${g.label}: sin respuestas registradas (${g.n} pregunta${g.n === 1 ? '' : 's'})`
                : `${g.label}: ${g.pct}% calculado sobre ${g.respondidas} de ${g.n} pregunta${g.n === 1 ? '' : 's'} evaluada${g.n === 1 ? '' : 's'}`
          }
          className="bg-slate-50 rounded-lg px-1 py-1.5 flex flex-col items-center gap-0.5 text-center"
        >
          {g.logo
            ? <img src={g.logo} alt="" aria-hidden="true" className="w-6 h-6 object-contain" />
            : <span aria-hidden="true" className="w-6 h-6 flex items-center justify-center text-slate-400 text-sm font-black">ND</span>}
          <span className="text-[9px] font-bold text-slate-600 leading-none">{g.label}</span>
          <span className="text-[11px] font-black text-slate-800 leading-none">{g.pct === null ? '—' : `${g.pct}%`}</span>
        </div>
      ))}
    </div>
    {cobertura && cobertura.respondidas > 0 && cobertura.respondidas < cobertura.total && (
      <p className="text-[9px] font-bold text-amber-700 mt-1">
        Evaluadas {cobertura.respondidas} de {cobertura.total} preguntas del sector: los porcentajes cubren solo lo auditado.
      </p>
    )}
  </div>
);
