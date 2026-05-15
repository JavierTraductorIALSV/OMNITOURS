

import React, { useState, useEffect } from 'react';

import {
  LayoutDashboard, ClipboardList, Building2, Utensils, Plane,
  Bus, Palmtree, Library, Wind, MapPin, ArrowRight,
  Eye, Ear, Brain, Smartphone, ShieldAlert, FileText, Navigation,
  Globe, Umbrella, ChevronRight, Info, ShieldCheck, TrendingUp, Camera,
  LogIn, LogOut, Type, Contrast, CheckCircle2
} from 'lucide-react';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Chart from 'chart.js/auto';

const App = () => {
  // Estados de accesibilidad
  const [contrastMode, setContrastMode] = useState('normal-contrast');
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1);
  
  // Estados principales
  const [view, setView] = useState('home');
  const [currentModule, setCurrentModule] = useState(0);
  const [answers, setAnswers] = useState({});
  const [evidences, setEvidences] = useState({});
  const [companyData, setCompanyData] = useState({
    name: '', rif: '', rtn: '', date: new Date().toISOString().split('T')[0],
    sector: '', address: '', city: '', state: '', phone: '', email: ''
  });
  const [adminSession, setAdminSession] = useState(null);
  const [allCompanies, setAllCompanies] = useState([]);
  const [uploadMessage, setUploadMessage] = useState({ show: false, text: '', type: '' });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [searchRif, setSearchRif] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [registrationErrors, setRegistrationErrors] = useState({});

  // Marca de agua IAET (pequeña)
  const waterMarkStyle = {
    position: 'fixed', bottom: '20px', right: '20px', opacity: 0.15,
    zIndex: 999, pointerEvents: 'none', width: '30px',
  };

  // Datos de ubicación
  const venezuelaStates = [
    'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo',
    'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico', 'Lara',
    'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre',
    'Táchira', 'Trujillo', 'La Guaira', 'Yaracuy', 'Zulia'
  ];
  const municipalities = {
    'Distrito Capital': ['Libertador'],
    'Miranda': ['Baruta', 'Carrizal', 'Chacao', 'El Hatillo', 'Guaicaipuro', 'Sucre', 'Zamora'],
    'Zulia': ['Maracaibo', 'San Francisco', 'Jesús Enrique Lossada', 'La Cañada de Urdaneta'],
    'Carabobo': ['Valencia', 'Naguanagua', 'San Diego', 'Guacara', 'Los Guayos'],
  };

  const ADMIN_EMAIL = 'javier.investigacionlsv@gmail.com';
  const ADMIN_PASSWORD = '123';

  const sectors = [
    { id: 'alojamiento', label: 'Alojamiento', icon: <Building2 size={24} /> },
    { id: 'restaurante', label: 'Restaurante', icon: <Utensils size={24} /> },
    { id: 'agencia', label: 'Agencia', icon: <Plane size={24} /> },
    { id: 'transporte', label: 'Transporte', icon: <Bus size={24} /> },
    { id: 'museo', label: 'Museo', icon: <Library size={24} /> },
    { id: 'aereo', label: 'Turismo Aéreo', icon: <Wind size={24} /> },
    { id: 'recreacional', label: 'Recreacional', icon: <Palmtree size={24} /> },
    { id: 'playa', label: 'Servicios de Playa', icon: <Umbrella size={24} /> },
  ];

  // Módulos completos (no cambio, igual que antes)
  const registrationModules = [
    { id: 'm1-1', title: 'MÓDULO 1.1: Acceso y Circulación', description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple)', questions: [
      { id: 'm1_1', text: 'Acceso: ¿Existen rampas con pendiente adecuada (máx. 6-8%) y pasamanos?', cat: 'Motora', max: 2 },
      { id: 'm1_2', text: 'Circulación: ¿Los pasillos y puertas tienen un ancho mínimo de 90 cm?', cat: 'Motora', max: 2 },
      { id: 'm1_3', text: 'Sanitarios: ¿Hay barras de apoyo, espacio de giro para silla de ruedas y grifería de palanca?', cat: 'Motora', max: 2 },
      { id: 'm1_4', text: 'Mobiliario: ¿Existen mesas o mostradores con altura adecuada para usuarios en silla de ruedas?', cat: 'Motora', max: 2 },
      { id: 'm1_5', text: 'Señalética: ¿Hay cartelería en Braille y alto relieve en puntos clave?', cat: 'Visual', max: 2 },
      { id: 'm1_6', text: 'Pavimento: ¿Existe suelo podotáctil en zonas de cambio de nivel o entradas?', cat: 'Visual', max: 2 }
    ]},
    { id: 'm1-2', title: 'MÓDULO 1.2: Iluminación, Acústica y Alertas', description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple)', questions: [
      { id: 'm1_7', text: 'Iluminación: ¿Los espacios están bien iluminados y sin reflejos?', cat: 'Visual', max: 2 },
      { id: 'm1_8', text: 'Obstáculos: ¿Pasillos libres de objetos salientes no detectables con bastón?', cat: 'Visual', max: 2 },
      { id: 'm1_9', text: 'Alertas: ¿Existen alarmas de emergencia visuales (luces estroboscópicas)?', cat: 'Auditiva', max: 2 },
      { id: 'm1_10', text: 'Información: ¿Hay pantallas informativas visibles para avisos o turnos?', cat: 'Auditiva', max: 2 },
      { id: 'm1_11', text: 'Acústica: ¿El diseño reduce el eco para facilitar audífonos?', cat: 'Auditiva', max: 2 },
      { id: 'm1_12', text: 'Señalética Cognitiva: ¿Se usan pictogramas universales?', cat: 'Neurodiversidad', max: 2 }
    ]},
    { id: 'm1-3', title: 'MÓDULO 1.3: Neurodiversidad y Confort', description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple)', questions: [
      { id: 'm1_13', text: 'Wayfinding: ¿Diseño intuitivo o líneas de color en suelo/paredes?', cat: 'Neurodiversidad', max: 2 },
      { id: 'm1_14', text: 'Lectura Fácil: ¿Menús, folletos o reglamentos en formato Lectura Fácil?', cat: 'Neurodiversidad', max: 2 },
      { id: 'm1_15', text: 'Zonas de Calma: ¿Área tranquila de baja estimulación sensorial?', cat: 'Neurodiversidad', max: 2 },
      { id: 'm1_16', text: 'Confort: ¿Se evita luces fluorescentes parpadeantes o música excesiva?', cat: 'Neurodiversidad', max: 2 },
      { id: 'm1_17', text: 'Previsibilidad: ¿Información previa con fotos y qué esperar?', cat: 'Neurodiversidad', max: 2 },
      { id: 'm1_18', text: 'Identificación: ¿Facilitan identificadores de discapacidad invisible?', cat: 'Neurodiversidad', max: 2 }
    ]},
    { id: 'm2', title: 'MÓDULO 2: Conocimientos y Herramientas para la Atención', description: 'Escala: 0 (Nulo) / 1 (Básico) / 2 (Bueno) / 3 (Excelente)', questions: [
      { id: 'm2_1', text: 'Lenguaje: ¿El personal conoce términos correctos?', cat: 'Protocolo', max: 3 },
      { id: 'm2_2', text: 'Autonomía: ¿Preguntan antes de ayudar y se dirigen al usuario?', cat: 'Protocolo', max: 3 },
      { id: 'm2_3', text: 'Motora: ¿Saben asistir en empuje de silla de ruedas?', cat: 'Motora', max: 3 },
      { id: 'm2_4', text: 'Visual: ¿Ofrecen brazo como guía y describen entorno?', cat: 'Visual', max: 3 },
      { id: 'm2_5', text: 'Auditiva: ¿Conocen técnicas básicas y LSV?', cat: 'Auditiva', max: 3 },
      { id: 'm2_6', text: 'Cognitiva: ¿Usan lenguaje sencillo y dan instrucciones paso a paso?', cat: 'Cognitiva', max: 3 }
    ]},
    { id: 'm3', title: 'MÓDULO 3: Ayudas Técnicas (1/2)', description: 'Escala: 0 (No cuenta) / 1 (Mantenimiento) / 2 (Disponible)', questions: [
      { id: 'm3_1', text: 'Movilidad interna: ¿Sillas de ruedas propias para préstamo?', cat: 'Motora', max: 2 },
      { id: 'm3_2', text: 'Transferencia: ¿Sillas de ducha o grúas en habitaciones adaptadas?', cat: 'Motora', max: 2 },
      { id: 'm3_3', text: 'Elevación: ¿Plataformas elevadoras donde no hay rampas?', cat: 'Motora', max: 2 },
      { id: 'm3_4', text: 'Documentación: ¿Menús en Braille o macrotipos?', cat: 'Visual', max: 2 },
      { id: 'm3_5', text: 'Tecnología QR: ¿Códigos QR para audiodescripciones?', cat: 'Visual', max: 2 },
      { id: 'm3_6', text: 'Asistencia Animal: ¿Kits para perros guía?', cat: 'Visual', max: 2 }
    ]},
    { id: 'm3-2', title: 'MÓDULO 3: Ayudas Técnicas (2/2)', description: 'Escala: 0 (No cuenta) / 1 (Mantenimiento) / 2 (Disponible)', questions: [
      { id: 'm3_7', text: 'Bucle Magnético: ¿En mostrador o sala?', cat: 'Auditiva', max: 2 },
      { id: 'm3_8', text: 'Sistemas de Aviso: ¿Dispositivos portátiles de vibración?', cat: 'Auditiva', max: 2 },
      { id: 'm3_9', text: 'Comunicación Visual: ¿Tablets para video-interpretación LSV?', cat: 'Auditiva', max: 2 },
      { id: 'm3_10', text: 'Kits Sensoriales: ¿Mochilas de calma?', cat: 'Neurodiversidad', max: 2 },
      { id: 'm3_11', text: 'Apoyos Visuales: ¿Tableros de comunicación con pictogramas?', cat: 'Neurodiversidad', max: 2 },
      { id: 'm3_12', text: 'Mapas Sensoriales: ¿Mapa con zonas de ruido/silencio?', cat: 'Neurodiversidad', max: 2 }
    ]},
    { id: 'm4', title: 'MÓDULO 4: Tecnologías de Apoyo', description: 'Escala: 0 (Inexistente) / 1 (Básica) / 2 (Adaptada) / 3 (Integral)', questions: [
      { id: 'm4_1', text: 'Accesibilidad Web: ¿WCAG?', cat: 'Digital', max: 3 },
      { id: 'm4_2', text: 'Tecnología Tiflotécnica: ¿Audiodescripción, Navilens?', cat: 'Visual', max: 3 },
      { id: 'm4_3', text: 'Tecnología de Comunicación: ¿Video-interpretación?', cat: 'Auditiva', max: 3 },
      { id: 'm4_4', text: 'Apoyos Cognitivos: ¿Realidad Aumentada o Lectura Fácil?', cat: 'Neurodiversidad', max: 3 },
      { id: 'm4_5', text: 'Domótica: ¿Control por voz o móvil?', cat: 'Motora', max: 3 }
    ]},
    { id: 'm5', title: 'MÓDULO 5: Gestión de Emergencias', description: 'Escala: 0 (No Cumple) / 1 (Parcial) / 2 (Cumple)', questions: [
      { id: 'm5_1', text: 'Evacuación: ¿Conoce el personal protocolo para evacuar a personas con discapacidad?', cat: 'Seguridad', max: 2 }
    ]}
  ];

  // ================= CONFIGURACIÓN DE CONTRASTE GLOBAL =================
  useEffect(() => {
    document.body.className = contrastMode;
    // Inyectar estilos para alto contraste (asegura que los elementos hijos también cambien)
    const style = document.createElement('style');
    style.id = 'contrast-styles';
    style.innerHTML = `
      body.high-dark, body.high-dark * { background-color: #000000 !important; color: #facc15 !important; border-color: #facc15 !important; }
      body.high-light, body.high-light * { background-color: #ffffff !important; color: #000000 !important; border-color: #000000 !important; }
      body.high-impact, body.high-impact * { background-color: #000000 !important; color: #ffeb3b !important; border-color: #ffeb3b !important; }
      /* Mejoras para inputs y botones en modo contraste */
      body.high-dark button, body.high-dark input, body.high-dark select, body.high-dark textarea { background-color: #111 !important; border-color: #facc15 !important; color: #facc15 !important; }
      body.high-light button, body.high-light input, body.high-light select, body.high-light textarea { background-color: #eee !important; border-color: #000 !important; color: #000 !important; }
      body.high-impact button, body.high-impact input, body.high-impact select, body.high-impact textarea { background-color: #222 !important; border-color: #ffeb3b !important; color: #ffeb3b !important; }
    `;
    if (!document.getElementById('contrast-styles')) document.head.appendChild(style);
    return () => {
      const existing = document.getElementById('contrast-styles');
      if (existing) existing.remove();
    };
  }, []);

  const cycleContrastMode = () => {
    const modes = ['normal-contrast', 'high-dark', 'high-light', 'high-impact'];
    const currentIndex = modes.indexOf(contrastMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    const newMode = modes[nextIndex];
    setContrastMode(newMode);
    document.body.className = newMode;
  };

  const increaseFontSize = () => setFontSizeMultiplier(v => Math.min(v + 0.1, 1.5));
  const decreaseFontSize = () => setFontSizeMultiplier(v => Math.max(v - 0.1, 0.8));

  // Funciones de puntuación
  const handleAnswer = (qId, val) => setAnswers(prev => ({ ...prev, [qId]: val }));

  const getModuleScore = (moduleId) => {
    const mod = registrationModules.find(m => m.id === moduleId);
    if (!mod) return { score:0, max:1, pct:0 };
    let score = 0, max = 0;
    mod.questions.forEach(q => {
      score += (answers[q.id] || 0);
      max += q.max;
    });
    return { score, max, pct: Math.round((score/max)*100) || 0 };
  };

  const getTotalStats = () => {
    let totalScore = 0, totalMax = 0;
    registrationModules.forEach(m => {
      const s = getModuleScore(m.id);
      totalScore += s.score;
      totalMax += s.max;
    });
    const pct = Math.round((totalScore/totalMax)*100) || 0;
    return { score: totalScore, max: totalMax, pct };
  };

  const getAchievementImage = (pct) => {
    if (pct >= 85) return '/Oro.png';
    if (pct >= 75) return '/plata.png';
    if (pct >= 60) return '/Bronce.png';
    if (pct >= 50) return '/Normal.png';
    return '/inaccesibilidad.png';
  };

  const isCurrentModuleComplete = () => {
    const module = registrationModules[currentModule];
    const missingQuestions = module.questions.filter(q => answers[q.id] === undefined);
    if (missingQuestions.length > 0) {
      const missingList = missingQuestions.map((q, idx) => `${idx + 1}. ${q.text}`).join('\n');
      alert(`❌ Faltan ${missingQuestions.length} pregunta(s) por responder en este módulo:\n\n${missingList}`);
      return false;
    }
    return true;
  };

  // Subir fotos
  const handlePhotoUpload = async (qId, photoIndex) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const btn = document.getElementById(`btn-${qId}-${photoIndex}`);
      if (btn) btn.innerText = 'Subiendo...';
      const fileName = `${companyData.rif || 'temp'}_${qId}_${photoIndex}_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('evidencias').upload(fileName, file);
      if (error) {
        setUploadMessage({ show: true, text: '❌ Error al subir', type: 'error' });
        if (btn) btn.innerText = 'Reintentar';
        setTimeout(() => setUploadMessage({ show: false, text: '', type: '' }), 3000);
        return;
      }
      const { data: publicUrlData } = supabase.storage.from('evidencias').getPublicUrl(fileName);
      setEvidences(prev => {
        const current = prev[qId] || [];
        const updated = [...current];
        updated[photoIndex] = publicUrlData.publicUrl;
        return { ...prev, [qId]: updated };
      });
      setUploadMessage({ show: true, text: '✅ Archivo guardado', type: 'success' });
      if (btn) btn.innerHTML = '✓ Foto';
      setTimeout(() => setUploadMessage({ show: false, text: '', type: '' }), 2000);
    };
    input.click();
  };

  // Validar campos obligatorios y formato de RIF
  const validateCompanyData = () => {
    const errors = {};
    if (!companyData.name.trim()) errors.name = 'El nombre comercial es obligatorio';
    if (!companyData.rif.trim()) errors.rif = 'El RIF es obligatorio';
    else {
      const rifRegex = /^[JjVvEe][-]?\d{6,10}([-]?\d{1})?$/;
      if (!rifRegex.test(companyData.rif)) errors.rif = 'Formato de RIF inválido (ej: J-12345678-9 o J123456789)';
    }
    if (!companyData.sector) errors.sector = 'Debe seleccionar un sector';
    if (!companyData.state) errors.state = 'Debe seleccionar un estado';
    if (!companyData.city) errors.city = 'Debe seleccionar un municipio';
    if (!companyData.address.trim()) errors.address = 'La dirección es obligatoria';
    setRegistrationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Guardar en Supabase
  const saveRegistrationToSupabase = async () => {
    try {
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          name: companyData.name,
          rif: companyData.rif.toUpperCase(),
          rtn: companyData.rtn,
          sector: companyData.sector,
          address: `${companyData.address}, ${companyData.city}, ${companyData.state}`,
          phone: companyData.phone,
          email: companyData.email,
          total_score: getTotalStats().score,
          total_percentage: getTotalStats().pct,
        })
        .select()
        .single();
      if (companyError) throw companyError;
      const answersToInsert = Object.entries(answers).map(([qId, value]) => ({ company_id: company.id, question_id: qId, score: value }));
      if (answersToInsert.length) await supabase.from('answers').insert(answersToInsert);
      const evidencesToInsert = Object.entries(evidences).map(([qId, urls]) => ({ company_id: company.id, question_id: qId, photo_urls: urls }));
      if (evidencesToInsert.length) await supabase.from('evidences').insert(evidencesToInsert);
      alert('Registro guardado exitosamente');
    } catch (error) {
      console.error(error);
      alert('Error al guardar');
    }
  };

  // Admin
  const handleAdminLogin = (e) => {
    e.preventDefault();
    if (loginEmail === ADMIN_EMAIL && loginPassword === ADMIN_PASSWORD) {
      setAdminSession({ email: loginEmail });
      setView('adminDashboard');
      cargarEmpresas();
    } else alert('Credenciales inválidas');
  };

  const cargarEmpresas = async () => {
    const { data } = await supabase.from('companies').select('*');
    setAllCompanies(data || []);
  };

  const logout = () => {
    setAdminSession(null);
    setView('home');
  };

  const buscarEmpresaPorRif = async () => {
    if (!searchRif.trim()) {
      alert('Ingrese un RIF válido');
      return;
    }
    setLoading(true);
    const rifUpper = searchRif.trim().toUpperCase();
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('rif', rifUpper)
      .maybeSingle();
    setLoading(false);
    if (error) {
      console.error(error);
      setSearchResult({ found: false, rif: rifUpper });
    } else if (data) {
      setSearchResult({ found: true, empresa: data });
    } else {
      setSearchResult({ found: false, rif: rifUpper });
    }
  };

  // Agrupación para reporte
  const reportModules = [
    { name: 'Infraestructura y Entorno Físico', subModules: ['m1-1', 'm1-2', 'm1-3'] },
    { name: 'Conocimientos y Herramientas para la Atención', subModules: ['m2'] },
    { name: 'Disponibilidad de Ayudas Técnicas', subModules: ['m3', 'm3-2'] },
    { name: 'Herramientas Tecnológicas de Apoyo', subModules: ['m4'] },
    { name: 'Gestión de Emergencias', subModules: ['m5'] }
  ];

  const chartColors = ['#4f46e5', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  // Generar PDF
  const generateCompanyReportPDF = async (company) => {
    console.log('Generando reporte para:', company.name, 'ID:', company.id);
    const { data: respuestas, error: respError } = await supabase
      .from('answers')
      .select('*')
      .eq('company_id', company.id);
    if (respError) {
      console.error(respError);
      alert('Error al cargar respuestas');
      return;
    }
    if (!respuestas || respuestas.length === 0) {
      alert('⚠️ No se encontraron respuestas para esta empresa. Complete el registro hasta el final.');
      return;
    }

    const respuestasMap = {};
    respuestas.forEach(r => respuestasMap[r.question_id] = r.score);

    const getGroupScores = (subModuleIds) => {
      let totalScore = 0, totalMax = 0;
      subModuleIds.forEach(subId => {
        const mod = registrationModules.find(m => m.id === subId);
        if (mod) {
          mod.questions.forEach(q => {
            totalScore += respuestasMap[q.id] || 0;
            totalMax += q.max;
          });
        }
      });
      const pct = totalMax === 0 ? 0 : Math.round((totalScore / totalMax) * 100);
      return { score: totalScore, max: totalMax, pct };
    };

    const groupResults = reportModules.map(group => {
      const { pct } = getGroupScores(group.subModules);
      return { name: group.name, pct };
    });

    let totalScoreAll = 0, totalMaxAll = 0;
    groupResults.forEach(g => {
      const { score, max } = getGroupScores(reportModules.find(r => r.name === g.name).subModules);
      totalScoreAll += score;
      totalMaxAll += max;
    });
    const totalPct = totalMaxAll === 0 ? 0 : Math.round((totalScoreAll / totalMaxAll) * 100);

    let nivelTexto = '';
    if (totalPct >= 85) nivelTexto = 'ORO (Excelente)';
    else if (totalPct >= 75) nivelTexto = 'PLATA (Muy Bueno)';
    else if (totalPct >= 60) nivelTexto = 'BRONCE (Bueno)';
    else if (totalPct >= 50) nivelTexto = 'NORMAL (Básico)';
    else nivelTexto = 'INACCESIBLE (Crítico)';

    // IA
    let analysisByModule = [];
    let generalRecommendations = [];
    try {
      const { data: analysisData, error: iaError } = await supabase.functions.invoke('generate-analysis', {
        body: {
          moduleScores: groupResults.map(g => ({ name: g.name, pct: g.pct })),
          totalPct: totalPct,
          detailed: true
        }
      });
      if (iaError) throw iaError;
      analysisByModule = analysisData.modulos || [];
      generalRecommendations = analysisData.recomendaciones || [];
    } catch (err) {
      console.error('Error IA, usando fallback:', err);
      const getDetailedInterpretation = (pct, moduleName) => {
        if (pct >= 85) return `✅ El módulo "${moduleName}" presenta un nivel excelente. La mayoría de los criterios se cumplen de manera óptima. Se recomienda mantener auditorías periódicas.`;
        if (pct >= 70) return `😊 El módulo "${moduleName}" alcanza un nivel bueno. Existen pequeños aspectos por mejorar, como señalización o formación puntual. Con inversiones menores se puede alcanzar la excelencia.`;
        if (pct >= 50) return `⚠️ El módulo "${moduleName}" está en nivel básico. Requiere mejoras significativas: eliminar barreras arquitectónicas, instalar ayudas técnicas básicas y capacitar al personal. Priorizar un plan de acción.`;
        if (pct >= 25) return `❌ El módulo "${moduleName}" es crítico. La mayoría de criterios no se cumplen. Se necesita intervención urgente: reformas estructurales, equipamiento específico y formación obligatoria.`;
        return `🚫 El módulo "${moduleName}" es nulo. No se evidencia accesibilidad. Comenzar desde cero con un diagnóstico detallado y un plan integral.`;
      };
      analysisByModule = groupResults.map(g => ({ nombre: g.name, analisis: getDetailedInterpretation(g.pct, g.name) }));
      generalRecommendations = [
        'Realizar una auditoría externa especializada en accesibilidad.',
        'Crear un comité de accesibilidad con personas con discapacidad.',
        'Priorizar mejoras en accesos, sanitarios y comunicación visual.'
      ];
    }

    const reportDiv = document.createElement('div');
    reportDiv.style.width = '800px';
    reportDiv.style.padding = '40px';
    reportDiv.style.backgroundColor = 'white';
    reportDiv.style.fontFamily = 'Arial, sans-serif';
    reportDiv.style.position = 'absolute';
    reportDiv.style.left = '-9999px';
    reportDiv.style.top = '-9999px';

    const trophyImage = getAchievementImage(totalPct);

    reportDiv.innerHTML = `
      <div id="pdf-content-container" style="position: relative; max-width: 100%;">
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="/Logo-OmniTours.png" style="height: 30px;" />
          <h1 style="font-size: 24px;">Informe de Accesibilidad Turística</h1>
          <h2 style="font-size: 18px; color: #555;">${company.name}</h2>
          <p><strong>RIF:</strong> ${company.rif} | <strong>RTN:</strong> ${company.rtn || 'N/A'} | <strong>Sector:</strong> ${company.sector}</p>
          <p><strong>Dirección:</strong> ${company.address || 'No registrada'} | <strong>Teléfono:</strong> ${company.phone || 'No registrado'} | <strong>Email:</strong> ${company.email || 'No registrado'}</p>
          <hr style="margin: 20px 0;" />
        </div>

        <div style="display: flex; justify-content: center; align-items: center; gap: 20px; background: #f0fdf4; border-radius: 20px; padding: 15px; margin: 20px 0; page-break-inside: avoid;">
          <div style="text-align: center;">
            <p style="font-size: 18px; font-weight: bold; margin: 0;">🏆 La empresa turística se encuentra en el nivel de</p>
            <p style="font-size: 24px; font-weight: black; color: #4f46e5; margin: 5px 0;">${nivelTexto}</p>
          </div>
          <img src="${trophyImage}" style="height: 80px; width: auto;" alt="Logro" />
        </div>

        <h3>Resultados por categoría</h3>
        <div style="display: flex; flex-wrap: wrap; justify-content: space-around;">
          ${groupResults.map((group, idx) => {
            const iaAnalysis = analysisByModule.find(a => a.nombre === group.name)?.analisis || 'Análisis no disponible.';
            const paragraphs = iaAnalysis.split('\n').filter(p => p.trim().length > 0);
            return `
              <div style="width: 280px; margin: 15px; text-align: center; border: 1px solid #e2e8f0; border-radius: 16px; padding: 12px; background: #fafafa; page-break-inside: avoid;">
                <canvas id="chart-${idx}" width="200" height="200" style="width:200px; height:200px;"></canvas>
                <p style="font-size: 14px; font-weight: bold; margin: 10px 0 5px;">${group.name}</p>
                <p style="font-size: 18px; font-weight: bold; margin: 0;">${group.pct}%</p>
                <div style="font-size: 11px; color: #334155; background: #f1f5f9; padding: 8px; border-radius: 12px; margin-top: 8px; text-align: left; max-height: 200px; overflow-y: auto;">
                  ${paragraphs.map(para => `<p style="margin: 0 0 8px 0;">${para}</p>`).join('')}
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div style="margin-top: 40px; text-align: center; page-break-inside: avoid;">
          <h3>Resultado General de Accesibilidad</h3>
          <canvas id="general-chart" width="250" height="250" style="width:250px; height:250px; margin: 0 auto;"></canvas>
          <p style="font-size: 20px; font-weight: bold; margin-top: 10px;">${totalPct}%</p>
          <div style="font-size: 13px; background: #f1f5f9; padding: 12px; border-radius: 16px; max-width: 400px; margin: 15px auto;">
            ${analysisByModule.find(a => a.nombre === 'General')?.analisis || (totalPct >= 85 ? 'Excelente nivel global.' : totalPct >= 70 ? 'Buen nivel, atender áreas identificadas.' : totalPct >= 50 ? 'Nivel básico, plan de mejora urgente.' : 'Nivel crítico, intervención inmediata.')}
          </div>
        </div>

        <div style="margin-top: 20px; page-break-inside: avoid;">
          <h4>Recomendaciones generales</h4>
          <ul style="text-align: left; margin-left: 20px;">
            ${generalRecommendations.map(rec => `<li style="margin-bottom: 8px;">${rec}</li>`).join('')}
          </ul>
        </div>

        <hr style="margin: 30px 0;" />
        <div style="margin-top: 40px; text-align: center;">
          <div style="border-top: 1px solid #ccc; width: 300px; margin: 0 auto; padding-top: 10px;">
            <strong>Dr. Juan Luján</strong><br/>
            Validador de Accesibilidad Turística
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(reportDiv);
    await new Promise(r => setTimeout(r, 100));

    const canvasElements = [];
    for (let i = 0; i < groupResults.length; i++) {
      const canvas = reportDiv.querySelector(`#chart-${i}`);
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const pct = groupResults[i].pct;
        if (canvas.chart) canvas.chart.destroy();
        canvas.chart = new Chart(ctx, {
          type: 'pie',
          data: {
            labels: ['Cumplimiento', 'Pendiente'],
            datasets: [{ data: [pct, 100 - pct], backgroundColor: [chartColors[i % chartColors.length], '#e2e8f0'], borderWidth: 0 }]
          },
          options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
        });
        canvasElements.push(canvas.chart);
      }
    }

    const generalCanvas = reportDiv.querySelector('#general-chart');
    if (generalCanvas) {
      const ctx = generalCanvas.getContext('2d');
      if (generalCanvas.chart) generalCanvas.chart.destroy();
      generalCanvas.chart = new Chart(ctx, {
        type: 'pie',
        data: {
          labels: ['Cumplimiento Total', 'Pendiente'],
          datasets: [{ data: [totalPct, 100 - totalPct], backgroundColor: ['#10b981', '#e2e8f0'], borderWidth: 0 }]
        },
        options: { responsive: false, maintainAspectRatio: true, plugins: { legend: { position: 'bottom' } } }
      });
      canvasElements.push(generalCanvas.chart);
    }

    await new Promise(r => setTimeout(r, 200));

    const watermarkDiv = document.createElement('div');
    watermarkDiv.style.position = 'absolute';
    watermarkDiv.style.top = '50%';
    watermarkDiv.style.left = '50%';
    watermarkDiv.style.transform = 'translate(-50%, -50%)';
    watermarkDiv.style.opacity = '0.1';
    watermarkDiv.style.pointerEvents = 'none';
    watermarkDiv.style.width = '100px';
    watermarkDiv.innerHTML = '<img src="/iaet-logo.png" style="width: 100%;" />';
    const container = reportDiv.querySelector('#pdf-content-container');
    if (container) container.appendChild(watermarkDiv);

    const canvas = await html2canvas(reportDiv, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    let heightLeft = imgHeight;
    while (heightLeft > pageHeight) {
      position = heightLeft - pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, -position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(`reporte_${company.rif}.pdf`);

    canvasElements.forEach(chart => chart.destroy());
    document.body.removeChild(reportDiv);
  };

  const textSizeStyle = { fontSize: `${fontSizeMultiplier * 1}rem` };

  return (
    <div className="flex flex-col h-screen font-sans relative" style={textSizeStyle}>
      <img src="/iaet-logo.png" alt="IAET" style={waterMarkStyle} />
      {uploadMessage.show && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-white text-sm font-bold ${uploadMessage.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {uploadMessage.text}
        </div>
      )}
      <header className="bg-white/90 backdrop-blur-md p-4 shadow-sm flex justify-between items-center sticky top-0 z-50 border-b">
        <img src="/Logo-OmniTours.png" alt="OmniTour" style={{ height: '200px', width: 'auto' }} />
        <div className="flex gap-2 items-center">
          <button onClick={increaseFontSize} className="p-1 rounded-full hover:bg-slate-200 active:bg-teal-500"><Type size={18} /></button>
          <button onClick={decreaseFontSize} className="p-1 rounded-full hover:bg-slate-200 active:bg-teal-500"><Type size={18} /></button>
          <button onClick={cycleContrastMode} className="p-1 rounded-full hover:bg-slate-200 active:bg-teal-500"><Contrast size={18} /></button>
          {adminSession ? (
            <button onClick={logout} className="text-red-500 text-xs flex items-center gap-1 active:bg-teal-500"><LogOut size={16}/> Salir</button>
          ) : (
            <button onClick={() => setView('adminLogin')} className="text-indigo-600 text-xs flex items-center gap-1 active:bg-teal-500"><LogIn size={16}/> Administrador</button>
          )}
        </div>
      </header>
      <main className="flex-1 overflow-y-auto p-4 pb-32">
        {/* HOME */}
        {view === 'home' && (
          <div className="max-w-md mx-auto space-y-6 pt-8 text-center">
            <h1 className="text-3xl font-black italic uppercase">Sistema de Registro<br/>Omnitours "Turismo para todos"</h1>
            <p className="text-sm">Plataforma oficial de registro técnico y verificación de accesibilidad universal.</p>
            <div className="bg-white p-8 rounded-3xl shadow-xl border relative">
              <ShieldCheck size={120} className="absolute top-0 right-0 opacity-5" />
              <h3 className="text-xl font-black mb-2">Inscribir Empresa</h3>
              <p className="text-xs mb-8">Complete el registro técnico aportando la información requerida por el Baremo de accesibilidad turística.</p>
              <button onClick={() => setView('registration')} className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:bg-teal-500 active:scale-95">
                Iniciar Proceso de Registro <ArrowRight size={18} />
              </button>
              <div className="flex justify-center items-center gap-2 mt-8 text-slate-400 text-[10px]">
                <img src="/iaet-logo.png" alt="IAET" style={{ height: '150px', width: 'auto' }} />
                <span>App desarrollada por el IAET</span>
              </div>
            </div>
          </div>
        )}

        {/* REGISTRO CON VALIDACIONES */}
        {view === 'registration' && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow border">
              <h2 className="text-xl font-black mb-6 flex items-center justify-center gap-2"><Building2 size={24} className="text-indigo-600" /> Datos del Prestador</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase block text-center">Nombre Comercial *</label>
                  <input className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center ${registrationErrors.name ? 'border-red-500' : 'border-slate-200'}`} value={companyData.name} onChange={e => setCompanyData({...companyData, name: e.target.value})} />
                  {registrationErrors.name && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.name}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block text-center">RIF * (ej: J-12345678-9)</label>
                  <input className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center uppercase ${registrationErrors.rif ? 'border-red-500' : 'border-slate-200'}`} value={companyData.rif} onChange={e => setCompanyData({...companyData, rif: e.target.value})} />
                  {registrationErrors.rif && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.rif}</p>}
                </div>
                <div><label className="text-[10px] font-black uppercase block text-center">RTN (opcional)</label>
                <input className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-center" value={companyData.rtn} onChange={e => setCompanyData({...companyData, rtn: e.target.value})} /></div>
                <div><label className="text-[10px] font-black uppercase block text-center">Teléfono</label>
                <input type="tel" className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-center" value={companyData.phone} onChange={e => setCompanyData({...companyData, phone: e.target.value})} placeholder="+58 212-555-1234" /></div>
                <div><label className="text-[10px] font-black uppercase block text-center">Correo electrónico</label>
                <input type="email" className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-center" value={companyData.email} onChange={e => setCompanyData({...companyData, email: e.target.value})} placeholder="empresa@ejemplo.com" /></div>
                <div>
                  <label className="text-[10px] font-black uppercase block text-center">Estado *</label>
                  <select className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center ${registrationErrors.state ? 'border-red-500' : 'border-slate-200'}`} value={companyData.state} onChange={e => setCompanyData({...companyData, state: e.target.value, city: ''})}>
                    <option value="">Seleccione</option>
                    {venezuelaStates.map(s => <option key={s}>{s}</option>)}
                  </select>
                  {registrationErrors.state && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.state}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block text-center">Municipio *</label>
                  <select className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center ${registrationErrors.city ? 'border-red-500' : 'border-slate-200'}`} value={companyData.city} onChange={e => setCompanyData({...companyData, city: e.target.value})} disabled={!companyData.state}>
                    <option value="">Seleccione</option>
                    {(municipalities[companyData.state] || []).map(c => <option key={c}>{c}</option>)}
                  </select>
                  {registrationErrors.city && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.city}</p>}
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block text-center">Dirección exacta *</label>
                  <input className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center ${registrationErrors.address ? 'border-red-500' : 'border-slate-200'}`} value={companyData.address} onChange={e => setCompanyData({...companyData, address: e.target.value})} placeholder="Calle, número, referencia" />
                  {registrationErrors.address && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.address}</p>}
                </div>
                <div className="rounded-2xl overflow-hidden border h-40 relative bg-slate-100 flex items-center justify-center">
                  <MapPin size={40} className="text-slate-400" />
                  <span className="absolute bottom-2 text-xs text-slate-500 text-center px-2">Ubicación: {companyData.address}, {companyData.city}, {companyData.state}</span>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase block text-center">Sector *</label>
                  <div className="grid grid-cols-2 gap-3">
  {sectors.map(s => (
    <button
      key={s.id}
      onClick={() => setCompanyData({...companyData, sector: s.id})}
      className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 active:scale-95 ${
        companyData.sector === s.id
          ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-[1.02]'
          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'
      }`}
    >
      {companyData.sector === s.id && (
        <CheckCircle2 size={20} className="absolute top-2 right-2 text-white" />
      )}
      {s.icon}
      <span className="text-[10px] font-black uppercase">{s.label}</span>
    </button>
  ))}
</div>
                  {registrationErrors.sector && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.sector}</p>}
                </div>
              </div>
            </div>
            <button onClick={() => { if (validateCompanyData()) setView('audit'); }} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black active:bg-teal-500 active:scale-95 flex items-center justify-center gap-2">Continuar Registro <ChevronRight size={20}/></button>
          </div>
        )}

        {/* AUDITORÍA CON BOTONES MEJORADOS Y EVIDENCIAS */}
        {view === 'audit' && (
          <div className="max-w-xl mx-auto space-y-6 pb-20">
            <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-xl">
              <span className="text-[10px] font-black">Módulo {currentModule+1}/{registrationModules.length}</span>
              <h2 className="text-xl font-black">{registrationModules[currentModule].title}</h2>
              <p className="text-sm">{registrationModules[currentModule].description}</p>
            </div>
            {registrationModules[currentModule].questions.map(q => (
              <div key={q.id} className="bg-white rounded-3xl shadow border p-6">
                <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{q.cat}</span>
                <p className="text-base font-bold my-4 text-center">{q.text}</p>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[0,1,2,3].filter(i => i <= q.max).map(i => (
                    <button
                      key={i}
                      onClick={() => handleAnswer(q.id, i)}
                      className={`py-3 text-sm font-black rounded-xl border transition-all duration-150 flex items-center justify-center gap-1 ${
                        answers[q.id] === i
                          ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-[1.02]'
                          : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {answers[q.id] === i && <span className="text-base">✓</span>}
                      {i}
                    </button>
                  ))}
                </div>
                <div className="border-t pt-4">
                  <p className="text-xs font-bold mb-2">Evidencias (máx 3):</p>
                  <div className="flex gap-2">
                    {[0,1,2].map(idx => (
                      <button key={idx} id={`btn-${q.id}-${idx}`} onClick={() => handlePhotoUpload(q.id, idx)} className={`px-3 py-1 rounded-lg text-xs font-black active:bg-teal-500 ${evidences[q.id]?.[idx] ? 'bg-green-100' : 'bg-slate-100'}`}>
                        <Camera size={14}/> {evidences[q.id]?.[idx] ? 'Foto' : `Subir ${idx+1}`}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-4 pt-4">
              {currentModule > 0 && <button onClick={() => setCurrentModule(m => m-1)} className="flex-1 bg-white border py-4 rounded-2xl active:bg-teal-500">← Módulo anterior</button>}
              {currentModule < registrationModules.length-1 ? (
                <button onClick={() => { if (isCurrentModuleComplete()) setCurrentModule(m => m+1); }} className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl active:bg-teal-500">Siguiente módulo →</button>
              ) : (
                <button onClick={async () => { if (isCurrentModuleComplete()) { await saveRegistrationToSupabase(); setView('results'); } }} className="flex-[2] bg-green-600 text-white py-4 rounded-2xl active:bg-teal-500">Finalizar</button>
              )}
            </div>
          </div>
        )}

        {/* RESULTADOS */}
        {view === 'results' && (
          <div id="report-content" className="max-w-md mx-auto space-y-6 pb-32">
            <div className="bg-white p-6 rounded-3xl shadow-xl text-center">
              <h2 className="text-2xl font-black">Resultados de Accesibilidad</h2>
              <p className="text-slate-500">{companyData.name}</p>
              <div className="mt-6 space-y-4 text-left">
                {registrationModules.map(mod => {
                  const st = getModuleScore(mod.id);
                  return (
                    <div key={mod.id}>
                      <div className="flex justify-between text-sm font-bold"><span>{mod.title}</span><span>{st.pct}%</span></div>
                      <div className="w-full bg-slate-200 rounded-full h-4"><div className="bg-indigo-600 h-4 rounded-full" style={{ width: `${st.pct}%` }}></div></div>
                    </div>
                  );
                })}
                <div className="pt-4 border-t mt-4">
                  <div className="flex justify-between text-lg font-black"><span>Promedio General</span><span>{getTotalStats().pct}%</span></div>
                  <div className="w-full bg-slate-200 rounded-full h-6 mt-2"><div className={`h-6 rounded-full ${getTotalStats().pct >= 50 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${getTotalStats().pct}%` }}></div></div>
                </div>
                <div className="flex justify-center mt-4"><img src={getAchievementImage(getTotalStats().pct)} className="w-40 h-auto rounded-lg shadow" alt="Logro" /></div>
              </div>
            </div>
          </div>
        )}

        {/* ADMIN LOGIN */}
        {view === 'adminLogin' && (
          <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-2xl shadow-xl">
            <h2 className="text-2xl font-black mb-6 text-center">Acceso Administrador</h2>
            <form onSubmit={handleAdminLogin}>
              <input type="email" placeholder="Email" className="w-full p-3 border rounded-xl mb-4" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required />
              <input type="password" placeholder="Contraseña" className="w-full p-3 border rounded-xl mb-6" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required />
              <button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black active:bg-teal-500">Ingresar</button>
            </form>
          </div>
        )}

        {/* ADMIN DASHBOARD */}
        {view === 'adminDashboard' && (
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <h2 className="text-2xl font-black">Panel de Administrador</h2>
              <div className="flex gap-2">
                <button onClick={() => setView('home')} className="bg-slate-200 px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500">← Volver al inicio</button>
                <button onClick={logout} className="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500">Cerrar sesión</button>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow mb-6">
              <h3 className="text-lg font-black mb-4">Generar reporte por empresa</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type="text" placeholder="Ingrese RIF de la empresa" className="flex-1 border rounded-xl px-4 py-3 text-center uppercase" value={searchRif} onChange={(e) => setSearchRif(e.target.value.toUpperCase())} />
                <button onClick={buscarEmpresaPorRif} disabled={loading} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black active:bg-teal-500 disabled:opacity-50">{loading ? 'Buscando...' : 'Buscar empresa'}</button>
              </div>
              {searchResult && (
                <div className="mt-4 p-4 border rounded-xl bg-slate-50">
                  {searchResult.found ? (
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div>
                        <p className="font-bold">{searchResult.empresa.name}</p>
                        <p className="text-xs text-slate-500">RIF: {searchResult.empresa.rif} | Score: {searchResult.empresa.total_percentage}%</p>
                        <p className="text-xs text-slate-400">Dirección: {searchResult.empresa.address}</p>
                      </div>
                      <button onClick={() => generateCompanyReportPDF(searchResult.empresa)} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500">📄 Generar reporte PDF</button>
                    </div>
                  ) : (
                    <p className="text-red-500 font-bold">❌ La empresa con RIF {searchResult.rif} no se ha registrado.</p>
                  )}
                </div>
              )}
            </div>
            <div className="bg-white p-6 rounded-2xl shadow">
              <h3 className="text-lg font-black mb-4">Empresas registradas</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {allCompanies.length === 0 ? (
                  <p className="text-slate-400 text-center py-4">No hay empresas registradas aún.</p>
                ) : (
                  allCompanies.map(emp => (
                    <div key={emp.id} className="border-b pb-3 flex justify-between items-center flex-wrap gap-2">
                      <div>
                        <p className="font-bold">{emp.name}</p>
                        <p className="text-xs text-slate-500">RIF: {emp.rif} | Score: {emp.total_percentage}%</p>
                        <p className="text-xs text-slate-400 truncate max-w-xs">{emp.address}</p>
                      </div>
                      <button onClick={() => generateCompanyReportPDF(emp)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-black active:bg-teal-500">📄 Reporte PDF</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <nav className="bg-white/90 backdrop-blur-xl border-t fixed bottom-0 w-full flex justify-around items-center h-24 px-8 pb-6 shadow-lg z-50">
        <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${view === 'home' ? 'text-indigo-600' : 'text-slate-300'}`}><LayoutDashboard size={24} /><span className="text-[9px] font-black">Inicio</span></button>
        <button onClick={() => setView('registration')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${view === 'registration' || view === 'audit' ? 'text-indigo-600' : 'text-slate-300'}`}><ClipboardList size={24} /><span className="text-[9px] font-black">Registrar</span></button>
        <button onClick={() => adminSession ? setView('adminDashboard') : setView('adminLogin')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${view === 'adminDashboard' || view === 'adminLogin' ? 'text-indigo-600' : 'text-slate-300'}`}><TrendingUp size={24} /><span className="text-[9px] font-black">Métricas</span></button>
      </nav>
    </div>
  );
};

export default App;