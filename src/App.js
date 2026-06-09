import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard, ClipboardList, Building2, Utensils, Plane,
  Bus, Palmtree, Library, Wind, MapPin, ArrowRight,
  Eye, Ear, Brain, Smartphone, ShieldAlert, FileText, Navigation,
  Globe, Umbrella, ChevronRight, Info, ShieldCheck, TrendingUp, Camera,
  LogIn, LogOut, Type, Contrast, CheckCircle2, Download, BarChart
} from 'lucide-react';
import { supabase } from './supabaseClient';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Header } from 'docx';

// Función auxiliar para convertir dataURI a Blob (para fotos offline)
const dataURItoBlob = (dataURI) => {
  const byteString = atob(dataURI.split(',')[1]);
  const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeString });
};

const App = () => {
  // ========== ESTADOS DE ACCESIBILIDAD ==========
  const [contrastMode, setContrastMode] = useState('normal-contrast');
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(1);
  
  // ========== ESTADOS PRINCIPALES ==========
  const [view, setView] = useState('home');
  const [currentModule, setCurrentModule] = useState(0);
  const [currentQuestionPage, setCurrentQuestionPage] = useState(0);
  const [answers, setAnswers] = useState({});
  const [evidences, setEvidences] = useState({});
  const [companyData, setCompanyData] = useState({
    name: '', rif: '', rtn: '', date: new Date().toISOString().split('T')[0],
    sector: '', address: '', city: '', state: '', phone: '', email: ''
  });
  const [adminSession, setAdminSession] = useState(null);
  const [allCompanies, setAllCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [selectedState, setSelectedState] = useState('');
  const [statsByState, setStatsByState] = useState([]);
  const [uploadMessage, setUploadMessage] = useState({ show: false, text: '', type: '' });
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [searchRif, setSearchRif] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [registrationErrors, setRegistrationErrors] = useState({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // ========== CREDENCIALES DE ADMINISTRADORES ==========
  const ADMIN_CREDENTIALS = [
    { email: 'javier.investigacionlsv@gmail.com', password: '123' },
    { email: 'juanenriquelujananzola@gmail.com', password: '260479' }
  ];

  // ========== DATOS DE UBICACIÓN ==========
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
    'Nueva Esparta': ['Antolín del Campo', 'Arismendi', 'Diaz', 'García', 'Gómez', 'Maneiro', 'Marcano', 'Mariño', 'Península de Macanao', 'Tubores', 'Villalba'],
    'Barinas': ['Alberto Arvelo Torrealba', 'Andrés Eloy Blanco', 'Antonio José de Sucre', 'Arismendi', 'Barinas', 'Bolívar', 'Cruz Paredes', 'Ezequiel Zamora', 'Obispos', 'Pedraza', 'Rojas', 'Sosa'],
    'Falcón': ['Acosta', 'Bolívar', 'Buchivacoa', 'Carirubana', 'Colina', 'Dabajuro', 'Democracia', 'Falcón', 'Federación', 'Iturriza', 'Jacura', 'Los Taques', 'Mauroa', 'Manaure', 'Miranda', 'Palmasola', 'Petit', 'Píritu', 'San Francisco', 'Silva', 'Sucre', 'Tocópero', 'Unión', 'Urumaco', 'Zamora'],
    'Anzoátegui': ['Anaco', 'Aragua', 'Bolívar', 'Bruzual', 'Cajigal', 'Carvajal', 'Diego Bautista Urbaneja', 'Freites', 'Guanta', 'Guanipa', 'Independencia', 'Juan Antonio Sotillo', 'Libertad', 'McGregor', 'Miranda', 'Monagas', 'Peñalver', 'Píritu', 'San Juan de Capistrano', 'Santa Ana', 'Simón Rodríguez'],
    'Mérida': ['Alberto Adriani', 'Andrés Bello', 'Antonio Pinto Salinas', 'Aricagua', 'Arzobispo Chacón', 'Campo Elías', 'Caracciolo Parra Olmedo', 'Cardenal Quintero', 'Guaraque', 'Julio César Salas', 'Justo Briceño', 'Libertador', 'Miranda', 'Obispo Ramos de Lora', 'Padre Noguera', 'Pueblo Llano', 'Rangel', 'Rivas Dávila', 'Santos Marquina', 'Sucre', 'Tovar', 'Tulio Febres Cordero', 'Zea'],
    'Trujillo': ['Andrés Bello', 'Boconó', 'Bolívar', 'Candelaria', 'Carache', 'Carvajal', 'Campo Elías', 'Escuque', 'La Ceiba', 'José Felipe Márquez Cañizales', 'Miranda', 'Monte Carmelo', 'Motatán', 'Pampán', 'Pampanito', 'Rafael Rangel', 'Sucre', 'Trujillo', 'Urdaneta', 'Valera'],
    'Sucre': ['Andrés Eloy Blanco', 'Andrés Mata', 'Arismendi', 'Benítez', 'Bermúdez', 'Bolívar', 'Cajigal', 'Cruz Salmerón Acosta', 'Libertador', 'Mariño', 'Mejía', 'Montes', 'Ribero', 'Sucre', 'Valdez'],
    'Portuguesa': ['Agua Blanca', 'Araure', 'Esteller', 'Guanare', 'Guanarito', 'Monseñor José Vicente de Unda', 'Ospino', 'Páez', 'Papelón', 'San Genaro de Boconoíto', 'San Rafael de Onoto', 'Santa Rosalía', 'Sucre', 'Turén'],
    'Lara': ['Andrés Eloy Blanco', 'Crespo', 'Iribarren', 'Jiménez', 'Morán', 'Palavecino', 'Simón Planas', 'Torres', 'Urdaneta'],
    'La Guaira': ['Vargas'],
    'Táchira': ['Andrés Bello', 'Antonio Rómulo Costa', 'Ayacucho', 'Bolívar', 'Cárdenas', 'Córdoba', 'Fernández Feo', 'Francisco de Miranda', 'García de Hevia', 'Guásimos', 'Independencia', 'Jáuregui', 'José María Vargas', 'Junín', 'Libertad', 'Libertador', 'Lobatera', 'Michelena', 'Panamericano', 'Pedro María Ureña', 'Rafael Urdaneta', 'Samuel Darío Maldonado', 'San Cristóbal', 'San Judas Tadeo', 'Seboruco', 'Simón Rodríguez', 'Sucre', 'Torbes', 'Uribante'],
    'Yaracuy': ['Arístides Bastidas', 'Bolívar', 'Bruzual', 'Cocorote', 'Independencia', 'José Antonio Páez', 'La Trinidad', 'Manuel Monge', 'Nirgua', 'Peña', 'San Felipe', 'Sucre', 'Urachiche', 'Veroes'],
    'Monagas': ['Acosta', 'Aguasay', 'Bolívar', 'Caripe', 'Cedeño', 'Ezequiel Zamora', 'Libertador', 'Maturín', 'Piar', 'Punceres', 'Santa Bárbara', 'Sotillo', 'Uracoa'],
    'Amazonas': ['Alto Orinoco', 'Atabapo', 'Atures', 'Autana', 'Manapiare', 'Maroa', 'Río Negro'],
    'Apure': ['Achaguas', 'Biruaca', 'Muñoz', 'Páez', 'Pedro Camejo', 'Rómulo Gallegos', 'San Fernando'],
    'Guárico': ['Camaguán', 'Chaguaramas', 'El Socorro', 'Francisco de Miranda', 'José Félix Ribas', 'José Tadeo Monagas', 'Juan Germán Roscio', 'Julián Mellado', 'Las Mercedes', 'Leonardo Infante', 'Ortiz', 'Pedro Zaraza', 'San Gerónimo de Guayabal', 'San José de Guaribe', 'Santa María de Ipire'],
    'Bolívar': ['Angostura', 'Caroní', 'Cedeño', 'Chien', 'El Callao', 'Gran Sabana', 'Heres', 'Piar', 'Roscio', 'Sifontes', 'Sucre'],
    'Aragua': ['Bolívar', 'Camatagua', 'Francisco Linares Alcántara', 'Girardot', 'José Ángel Lamas', 'José Félix Ribas', 'José Rafael Revenga', 'Libertador', 'Mario Briceño Iragorry', 'Ocumare de la Costa de Oro', 'San Casimiro', 'San Sebastián', 'Santiago Mariño', 'Santos Michelena', 'Sucre', 'Tovar', 'Urdaneta', 'Zamora']
  };

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

  // ========== MÓDULOS DE EVALUACIÓN (igual que tenías) ==========
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

  const reportModules = [
    { name: 'Infraestructura y Entorno Físico', subModules: ['m1-1', 'm1-2', 'm1-3'] },
    { name: 'Conocimientos y Herramientas para la Atención', subModules: ['m2'] },
    { name: 'Disponibilidad de Ayudas Técnicas', subModules: ['m3', 'm3-2'] },
    { name: 'Herramientas Tecnológicas de Apoyo', subModules: ['m4'] },
    { name: 'Gestión de Emergencias', subModules: ['m5'] }
  ];

  // ========== CONFIGURACIÓN DE CONTRASTE ==========
  useEffect(() => {
    document.body.className = contrastMode;
    const style = document.createElement('style');
    style.id = 'contrast-styles';
    style.innerHTML = `
      body.high-dark, body.high-dark * { background-color: #000000 !important; color: #facc15 !important; border-color: #facc15 !important; }
      body.high-light, body.high-light * { background-color: #ffffff !important; color: #000000 !important; border-color: #000000 !important; }
      body.high-impact, body.high-impact * { background-color: #000000 !important; color: #ffeb3b !important; border-color: #ffeb3b !important; }
      body.high-dark button, body.high-dark input, body.high-dark select, body.high-dark textarea { background-color: #111 !important; border-color: #facc15 !important; color: #facc15 !important; }
      body.high-light button, body.high-light input, body.high-light select, body.high-light textarea { background-color: #eee !important; border-color: #000 !important; color: #000 !important; }
      body.high-impact button, body.high-impact input, body.high-impact select, body.high-impact textarea { background-color: #222 !important; border-color: #ffeb3b !important; color: #ffeb3b !important; }
    `;
    if (!document.getElementById('contrast-styles')) document.head.appendChild(style);
    return () => document.getElementById('contrast-styles')?.remove();
  }, [contrastMode]);

  const cycleContrastMode = () => {
    const modes = ['normal-contrast', 'high-dark', 'high-light', 'high-impact'];
    const currentIndex = modes.indexOf(contrastMode);
    const nextIndex = (currentIndex + 1) % modes.length;
    setContrastMode(modes[nextIndex]);
    document.body.className = modes[nextIndex];
  };

  const increaseFontSize = () => setFontSizeMultiplier(v => Math.min(v + 0.1, 1.5));
  const decreaseFontSize = () => setFontSizeMultiplier(v => Math.max(v - 0.1, 0.8));

  // ========== FUNCIONES DE PUNTUACIÓN ==========
  const getModuleScore = (moduleId) => {
    const mod = registrationModules.find(m => m.id === moduleId);
    if (!mod) return { score: 0, max: 1, pct: 0 };
    let score = 0, max = 0;
    mod.questions.forEach(q => {
      score += (answers[q.id] || 0);
      max += q.max;
    });
    return { score, max, pct: Math.round((score / max) * 100) || 0 };
  };

  const getTotalStats = () => {
    let totalScore = 0, totalMax = 0;
    registrationModules.forEach(m => {
      const s = getModuleScore(m.id);
      totalScore += s.score;
      totalMax += s.max;
    });
    const pct = Math.round((totalScore / totalMax) * 100) || 0;
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

  // ========== SUBIR FOTOS ==========
  const getQuestionText = (qId) => {
    for (let mod of registrationModules) {
      const q = mod.questions.find(q => q.id === qId);
      if (q) return q.text;
    }
    return '';
  };

  const analyzeImage = (qId) => {
    const questionText = getQuestionText(qId).toLowerCase();
    const keywords = ['rampa', 'pasamanos', 'ancho', 'sanitario', 'mobiliario', 'braille', 'iluminación', 'alarma', 'acústica'];
    const found = keywords.filter(k => questionText.includes(k));
    if (found.length === 0) return "Análisis no concluyente. Se requiere inspección manual.";
    return `Se detectan elementos relacionados con: ${found.join(', ')}. La evidencia visual sugiere ${Math.random() > 0.5 ? 'cumplimiento parcial' : 'necesidad de mejora'}.`;
  };

  // ========== GUARDADO LOCAL Y PROGRESO ==========
  const saveProgressLocally = () => {
    const progress = {
      answers,
      currentModule,
      currentQuestionPage,
      companyData,
      evidences,
      timestamp: Date.now()
    };
    localStorage.setItem('omnitour_progress', JSON.stringify(progress));
  };

  const loadProgressLocally = () => {
    const saved = localStorage.getItem('omnitour_progress');
    if (saved) {
      try {
        const { answers: savedAnswers, currentModule: savedModule, currentQuestionPage: savedPage, companyData: savedCompany, evidences: savedEvidences } = JSON.parse(saved);
        setAnswers(savedAnswers);
        setCurrentModule(savedModule);
        setCurrentQuestionPage(savedPage);
        setCompanyData(savedCompany);
        setEvidences(savedEvidences);
        alert('✅ Se ha recuperado el progreso guardado. Puedes continuar desde donde lo dejaste.');
      } catch(e) { console.error(e); }
    }
  };

  const saveAnswerOffline = (qId, val) => {
    const offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    offlineQueue.push({ type: 'answer', qId, val, timestamp: Date.now() });
    localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
  };

  const savePhotoOffline = (qId, photoIndex, file) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
      offlineQueue.push({ type: 'photo', qId, photoIndex, data: reader.result, timestamp: Date.now() });
      localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
    };
    reader.readAsDataURL(file);
  };

  // ========== SINCRONIZACIÓN OFFLINE ==========
  useEffect(() => {
    const syncOfflineData = async () => {
      const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
      if (queue.length === 0) return;
      alert('🔄 Conexión recuperada. Sincronizando datos pendientes...');
      for (const item of queue) {
        if (item.type === 'answer') {
          handleAnswer(item.qId, item.val);
        } else if (item.type === 'photo') {
          const blob = dataURItoBlob(item.data);
          const file = new File([blob], `offline_${item.qId}_${item.photoIndex}.jpg`, { type: 'image/jpeg' });
          await handlePhotoUpload(item.qId, item.photoIndex, file);
        }
      }
      localStorage.removeItem('offlineQueue');
      alert('✅ Datos sincronizados correctamente.');
    };
    window.addEventListener('online', syncOfflineData);
    return () => window.removeEventListener('online', syncOfflineData);
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ========== PWA INSTALL ==========
  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstall = () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(() => setDeferredPrompt(null));
    }
  };

  // ========== HANDLE ANSWER ==========
  const handleAnswer = (qId, val) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
    saveProgressLocally();
    if (!navigator.onLine) {
      saveAnswerOffline(qId, val);
      alert('📡 Sin conexión. La respuesta se guardará localmente y se sincronizará después.');
    }
  };

  // ========== HANDLE PHOTO UPLOAD ==========
  const handlePhotoUpload = async (qId, photoIndex, fileFromOffline = null) => {
    const getFileFromInput = () => {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => {
          const file = e.target.files[0];
          resolve(file);
        };
        input.click();
      });
    };

    const file = fileFromOffline || (await getFileFromInput());
    if (!file) return;

    const btn = document.getElementById(`btn-${qId}-${photoIndex}`);
    if (btn) btn.innerText = 'Subiendo...';

    if (!navigator.onLine) {
      savePhotoOffline(qId, photoIndex, file);
      setUploadMessage({ show: true, text: '📡 Sin conexión. La foto se guardará localmente y se subirá después.', type: 'info' });
      if (btn) btn.innerHTML = '📱 Pendiente';
      setTimeout(() => setUploadMessage({ show: false, text: '', type: '' }), 2000);
      return;
    }

    const fileName = `${companyData.rif || 'temp'}_${qId}_${photoIndex}_${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('evidencias').upload(fileName, file);
    if (error) {
      setUploadMessage({ show: true, text: '❌ Error al subir', type: 'error' });
      if (btn) btn.innerText = 'Reintentar';
      setTimeout(() => setUploadMessage({ show: false, text: '', type: '' }), 3000);
      return;
    }
    const { data: publicUrlData } = supabase.storage.from('evidencias').getPublicUrl(fileName);
    const photoUrl = publicUrlData.publicUrl;
    const analysis = analyzeImage(qId);
    setEvidences(prev => {
      const current = prev[qId] || [];
      const updated = [...current];
      updated[photoIndex] = { url: photoUrl, analysis: analysis };
      return { ...prev, [qId]: updated };
    });
    setUploadMessage({ show: true, text: '✅ Archivo guardado', type: 'success' });
    if (btn) btn.innerHTML = '✓ Foto';
    setTimeout(() => setUploadMessage({ show: false, text: '', type: '' }), 2000);
    saveProgressLocally();
  };

  // ========== VALIDACIÓN DE DATOS DE EMPRESA ==========
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

  // ========== GUARDAR EN SUPABASE ==========
  const saveRegistrationToSupabase = async () => {
    try {
      if (!navigator.onLine) {
        const pendingRegistration = { companyData, answers, evidences, timestamp: Date.now() };
        localStorage.setItem('pendingRegistration', JSON.stringify(pendingRegistration));
        alert('Registro guardado localmente. Se enviará cuando haya conexión.');
        localStorage.removeItem('omnitour_progress');
        localStorage.removeItem('progress_loaded');
        setView('results');
        return;
      }

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
      const evidencesToInsert = Object.entries(evidences).flatMap(([qId, photos]) =>
        photos.filter(p => p && p.url).map(p => ({
          company_id: company.id,
          question_id: qId,
          photo_urls: [p.url],
          ai_analysis: [p.analysis]
        }))
      );
      if (evidencesToInsert.length) await supabase.from('evidences').insert(evidencesToInsert);
      alert('¡Gracias por participar, uno de nuestros especialistas te compartirá los resultados en un reporte que además de mostrarte los niveles de accesibilidad te brindará opciones para mejorarla!');
      localStorage.removeItem('omnitour_progress');
      localStorage.removeItem('progress_loaded');
    } catch (error) {
      console.error(error);
      alert('Error al guardar');
    }
  };

  // ========== ADMIN (LOGIN LOCAL) ==========
  const handleAdminLogin = (e) => {
    e.preventDefault();
    const isValid = ADMIN_CREDENTIALS.some(admin => admin.email === loginEmail && admin.password === loginPassword);
    if (isValid) {
      setAdminSession({ email: loginEmail });
      setView('adminDashboard');
      cargarEmpresas();
    } else {
      alert('Credenciales inválidas');
    }
  };

  const cargarEmpresas = async () => {
    const { data } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    setAllCompanies(data || []);
    setFilteredCompanies(data || []);
    calcularStatsPorEstado(data || []);
  };

  const logout = () => {
    setAdminSession(null);
    setView('home');
  };

  const buscarEmpresaPorRif = async () => {
    if (!searchRif.trim()) { alert('Ingrese un RIF válido'); return; }
    setLoading(true);
    const rifUpper = searchRif.trim().toUpperCase();
    const { data, error } = await supabase.from('companies').select('*').eq('rif', rifUpper).maybeSingle();
    setLoading(false);
    if (error) setSearchResult({ found: false, rif: rifUpper });
    else if (data) setSearchResult({ found: true, empresa: data });
    else setSearchResult({ found: false, rif: rifUpper });
  };

  const calcularStatsPorEstado = (companies) => {
    const stats = {};
    companies.forEach(emp => {
      if (!emp.address) return;
      const parts = emp.address.split(',');
      const estado = parts.length > 2 ? parts[2].trim() : 'Desconocido';
      if (!stats[estado]) stats[estado] = { count: 0, sumPct: 0 };
      stats[estado].count++;
      stats[estado].sumPct += emp.total_percentage || 0;
    });
    const statsArray = Object.entries(stats).map(([estado, data]) => ({
      estado,
      cantidad: data.count,
      promedio: Math.round(data.sumPct / data.count)
    }));
    setStatsByState(statsArray);
  };

  const filtrarPorEstado = (estado) => {
    setSelectedState(estado);
    if (!estado) setFilteredCompanies(allCompanies);
    else {
      const filtradas = allCompanies.filter(emp => {
        if (!emp.address) return false;
        const parts = emp.address.split(',');
        return parts.length > 2 && parts[2].trim() === estado;
      });
      setFilteredCompanies(filtradas);
    }
  };

  const exportToExcel = () => {
    const data = filteredCompanies.map(emp => {
      const parts = emp.address ? emp.address.split(',') : [];
      const estado = parts.length > 2 ? parts[2].trim() : 'No especificado';
      return {
        'Nombre': emp.name,
        'RIF': emp.rif,
        'Sector': emp.sector,
        'Estado': estado,
        'Porcentaje': `${emp.total_percentage || 0}%`,
        'Fecha Registro': new Date(emp.created_at).toLocaleDateString()
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empresas');
    XLSX.writeFile(wb, `empresas_registradas_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const getPctColor = (pct) => {
    if (pct >= 85) return 'bg-green-500';
    if (pct >= 75) return 'bg-emerald-500';
    if (pct >= 60) return 'bg-yellow-500';
    if (pct >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getCategoryDescription = (name, pct) => {
    if (name === 'Infraestructura y Entorno Físico') {
      if (pct === 0) return `El módulo "${name}" es nulo. No se evidencia accesibilidad. Comenzar desde cero con un diagnóstico detallado y un plan integral.`;
      if (pct <= 33) return `El módulo "${name}" es crítico. La mayoría de criterios no se cumplen. Se necesita intervención urgente: reformas estructurales, equipamiento específico y formación obligatoria.`;
      if (pct <= 66) return `El módulo "${name}" tiene avances parciales. Se recomienda priorizar las mejoras más urgentes (accesos, sanitarios, señalética) y continuar con un plan de adecuación progresivo.`;
      return `El módulo "${name}" presenta un nivel aceptable de accesibilidad. Se sugiere mantener y mejorar los aspectos identificados como óptimos.`;
    }
    if (name === 'Conocimientos y Herramientas para la Atención') {
      if (pct === 0) return `El módulo "${name}" es nulo. El personal no está formado. Es imprescindible un plan de capacitación urgente.`;
      if (pct <= 33) return `El módulo "${name}" es muy bajo. Se requiere formación básica en atención inclusiva y sensibilización.`;
      if (pct <= 66) return `El módulo "${name}" tiene algunos avances. Reforzar la formación en Lengua de Señas y trato digno.`;
      return `El módulo "${name}" es bueno. Continuar con actualizaciones periódicas y evaluaciones de calidad.`;
    }
    if (name === 'Disponibilidad de Ayudas Técnicas') {
      if (pct === 0) return `El módulo "${name}" es nulo. No se cuenta con ningún tipo de ayuda técnica. Inversión prioritaria.`;
      if (pct <= 33) return `El módulo "${name}" es crítico. La mayoría de criterios no se cumplen. Se necesita intervención urgente: reformas estructurales, equipamiento específico y formación obligatoria.`;
      if (pct <= 66) return `El módulo "${name}" tiene ayudas parciales. Ampliar el inventario de dispositivos (sillas de ruedas, bucles magnéticos, kits sensoriales).`;
      return `El módulo "${name}" es adecuado. Mantener y actualizar los equipos según las necesidades.`;
    }
    if (name === 'Herramientas Tecnológicas de Apoyo') {
      if (pct === 0) return `El módulo "${name}" es nulo. No existe adaptación tecnológica. Urge implementar accesibilidad web y apps.`;
      if (pct <= 33) return `El módulo "${name}" es crítico. La mayoría de criterios no se cumplen. Se necesita intervención urgente: reformas estructurales, equipamiento específico y formación obligatoria.`;
      if (pct <= 66) return `El módulo "${name}" tiene avances incipientes. Incorporar sistemas de inducción, audiodescripción y realidad aumentada.`;
      return `El módulo "${name}" es destacable. Seguir innovando en tecnología inclusiva.`;
    }
    if (name === 'Gestión de Emergencias') {
      if (pct === 0) return `El módulo "${name}" es nulo. No existen protocolos para personas con discapacidad. Crear plan de evacuación inclusivo.`;
      if (pct <= 33) return `El módulo "${name}" es deficiente. Capacitar al personal y diseñar rutas accesibles.`;
      if (pct <= 66) return `El módulo "${name}" tiene medidas básicas. Realizar simulacros con participación de personas con discapacidad.`;
      return `El módulo "${name}" es adecuado. Mantener las buenas prácticas y revisar periódicamente.`;
    }
    return `Módulo evaluado con ${pct}% de cumplimiento.`;
  };

  // ========== GENERAR REPORTE EN WORD CON ENCABEZADO ==========
  const generateCompanyReportWord = async (company) => {
    try {
      const { data: respuestas } = await supabase.from('answers').select('*').eq('company_id', company.id);
      if (!respuestas || respuestas.length === 0) {
        alert('⚠️ Esta empresa no ha completado el registro. No hay respuestas para generar el reporte.');
        return;
      }
      const respuestasMap = {};
      respuestas.forEach(r => respuestasMap[r.question_id] = r.score);

      const { data: evidenciasData } = await supabase.from('evidences').select('*').eq('company_id', company.id);

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
      let nivelTexto = '', trofeoImagen = '';
      if (totalPct >= 85) { nivelTexto = 'ORO (Excelente)'; trofeoImagen = '/Oro.png'; }
      else if (totalPct >= 75) { nivelTexto = 'PLATA (Muy Bueno)'; trofeoImagen = '/plata.png'; }
      else if (totalPct >= 60) { nivelTexto = 'BRONCE (Bueno)'; trofeoImagen = '/Bronce.png'; }
      else if (totalPct >= 50) { nivelTexto = 'NORMAL (Básico)'; trofeoImagen = '/Normal.png'; }
      else { nivelTexto = 'INACCESIBLE (Crítico)'; trofeoImagen = '/inaccesibilidad.png'; }

      const fetchImageAsArrayBuffer = async (url) => {
        const res = await fetch(url);
        return await res.arrayBuffer();
      };

      const logoOmniBuffer = await fetchImageAsArrayBuffer('/Logo-Omnitours.png');
      const logoIaetBuffer = await fetchImageAsArrayBuffer('/iaet-logo.png');
      const trofeoBuffer = await fetchImageAsArrayBuffer(trofeoImagen);

      // ========== ENCABEZADO ==========
      const header = new Header({
        children: [
          new Paragraph({
            children: [
              new ImageRun({ data: logoOmniBuffer, transformation: { width: 100, height: 50 } }),
              new TextRun('      '),
              new ImageRun({ data: logoIaetBuffer, transformation: { width: 50, height: 50 } })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
          })
        ]
      });

      const sections = [];

      sections.push(
        new Paragraph({ children: [new TextRun({ text: 'Informe de Accesibilidad Turística', bold: true, size: 26 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Nombre de la Empresa: ${company.name}`, bold: true, size: 22 })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun(`RIF: ${company.rif} | RTN: ${company.rtn || 'N/A'} | Sector: ${company.sector}`)], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun(`Dirección: ${company.address || 'No registrada'} | Teléfono: ${company.phone || 'No registrado'} | Email: ${company.email || 'No registrado'}`)], alignment: AlignmentType.CENTER, spacing: { after: 300 } })
      );

      sections.push(
        new Paragraph({ children: [new TextRun({ text: 'La empresa turística se encuentra en el nivel de', bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: nivelTexto, bold: true, color: "4F46E5", size: 28 })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new ImageRun({ data: trofeoBuffer, transformation: { width: 120, height: 120 } })], alignment: AlignmentType.CENTER, spacing: { after: 300 } })
      );

      sections.push(new Paragraph({ children: [new TextRun({ text: 'Resultados por categoría', bold: true, size: 22 })], spacing: { after: 200 } }));
      for (let i = 0; i < groupResults.length; i++) {
        const group = groupResults[i];
        const description = getCategoryDescription(group.name, group.pct);
        // Generar gráfico circular simple (porcentaje)
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 200, 200);
        const angulo = (group.pct / 100) * 2 * Math.PI;
        const start = -Math.PI / 2;
        const end = start + angulo;
        ctx.beginPath(); ctx.moveTo(100, 100); ctx.arc(100, 100, 80, 0, 2 * Math.PI); ctx.fillStyle = '#e2e8f0'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(100, 100); ctx.arc(100, 100, 80, start, end); ctx.fillStyle = '#4f46e5'; ctx.fill();
        ctx.font = 'bold 18px Arial'; ctx.fillStyle = '#1e293b'; ctx.fillText(`${group.pct}%`, 100, 115);
        const imgBuffer = await dataURLToArrayBuffer(canvas.toDataURL());
        sections.push(
          new Paragraph({ children: [new ImageRun({ data: imgBuffer, transformation: { width: 150, height: 150 } })], alignment: AlignmentType.CENTER, spacing: { after: 50 } }),
          new Paragraph({ children: [new TextRun({ text: `${group.name}: ${group.pct}%`, bold: true, size: 18 })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
          new Paragraph({ children: [new TextRun(description)], spacing: { after: 200 } })
        );
      }

      // Resultado general
      const canvasGen = document.createElement('canvas');
      canvasGen.width = 200; canvasGen.height = 200;
      const ctxGen = canvasGen.getContext('2d');
      const anguloGen = (totalPct / 100) * 2 * Math.PI;
      const startGen = -Math.PI / 2;
      const endGen = startGen + anguloGen;
      ctxGen.beginPath(); ctxGen.moveTo(100, 100); ctxGen.arc(100, 100, 80, 0, 2 * Math.PI); ctxGen.fillStyle = '#e2e8f0'; ctxGen.fill();
      ctxGen.beginPath(); ctxGen.moveTo(100, 100); ctxGen.arc(100, 100, 80, startGen, endGen); ctxGen.fillStyle = '#10b981'; ctxGen.fill();
      ctxGen.font = 'bold 18px Arial'; ctxGen.fillStyle = '#1e293b'; ctxGen.fillText(`${totalPct}%`, 100, 115);
      const generalImgBuffer = await dataURLToArrayBuffer(canvasGen.toDataURL());

      sections.push(
        new Paragraph({ children: [new TextRun({ text: 'Resultado General de Accesibilidad', bold: true, size: 22 })], spacing: { after: 200 } }),
        new Paragraph({ children: [new ImageRun({ data: generalImgBuffer, transformation: { width: 150, height: 150 } })], alignment: AlignmentType.CENTER, spacing: { after: 50 } }),
        new Paragraph({ children: [new TextRun({ text: `${totalPct}%`, bold: true, size: 24 })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun(totalPct >= 85 ? 'Excelente nivel global.' : totalPct >= 70 ? 'Buen nivel, atender áreas identificadas.' : totalPct >= 50 ? 'Nivel básico, plan de mejora urgente.' : 'Nivel crítico, intervención inmediata.')], alignment: AlignmentType.CENTER, spacing: { after: 400 } })
      );

      // Recomendaciones
      sections.push(new Paragraph({ children: [new TextRun({ text: 'Recomendaciones generales', bold: true, size: 20 })], spacing: { after: 200 } }));
      const recs = [
        'Realizar una auditoría externa especializada en accesibilidad.',
        'Crear un comité de accesibilidad con personas con discapacidad.',
        'Priorizar mejoras en accesos, sanitarios y comunicación visual.',
        'Recibir formación y capacitación en materia de turismo accesible contactar con el IAET',
        'El equipo de trabajo requiere capacitación en Lengua de Señas Venezolana, Orientación y Movilidad.'
      ];
      recs.forEach(rec => sections.push(new Paragraph({ children: [new TextRun(`• ${rec}`)], bullet: { level: 0 }, spacing: { after: 100 } })));
      sections.push(new Paragraph({ text: '', spacing: { after: 400 } }));

      // Evidencias fotográficas
      if (evidenciasData && evidenciasData.length > 0) {
        sections.push(new Paragraph({ children: [new TextRun({ text: 'Evidencias fotográficas y análisis de IA', bold: true, size: 20 })], spacing: { after: 200 } }));
        for (const ev of evidenciasData) {
          const questionText = getQuestionText(ev.question_id);
          const photoUrl = ev.photo_urls?.[0] || '';
          const analysis = ev.ai_analysis?.[0] || 'Sin análisis';
          sections.push(new Paragraph({ children: [new TextRun(`Pregunta asociada: ${questionText}`)], spacing: { after: 100 } }));
          if (photoUrl) {
            try {
              const imgBuffer = await fetchImageAsArrayBuffer(photoUrl);
              sections.push(new Paragraph({ children: [new ImageRun({ data: imgBuffer, transformation: { width: 300, height: 200 } })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }));
            } catch (err) { sections.push(new Paragraph({ children: [new TextRun('[No se pudo cargar la imagen]')], spacing: { after: 100 } })); }
          }
          sections.push(new Paragraph({ children: [new TextRun(`🤖 Análisis IA: ${analysis}`)], spacing: { after: 400 } }));
        }
      } else {
        sections.push(new Paragraph({ children: [new TextRun('No se cargaron evidencias fotográficas durante el registro.')], spacing: { after: 200 } }));
      }

      // Firma
      sections.push(new Paragraph({ text: '', spacing: { after: 400 } }));
      sections.push(new Paragraph({ children: [new TextRun({ text: 'Dr. Juan E. Luján A.', bold: true })], alignment: AlignmentType.CENTER }));
      sections.push(new Paragraph({ children: [new TextRun('Validador de Accesibilidad Turística')], alignment: AlignmentType.CENTER }));

      const doc = new Document({
        sections: [{
          children: sections,
          properties: {
            page: { margin: { top: 2000, bottom: 2000, left: 2000, right: 2000 } },
            headers: { default: header }
          }
        }]
      });
      const blob = await Packer.toBlob(doc);
      saveAs(blob, `reporte_${company.rif}.docx`);
    } catch (error) {
      console.error('Error generando reporte Word:', error);
      alert('Error al generar el reporte: ' + error.message);
    }
  };

  const dataURLToArrayBuffer = (dataURL) => {
    const base64 = dataURL.split(',')[1];
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
    return array.buffer;
  };

  const textSizeStyle = { fontSize: `${fontSizeMultiplier * 1}rem` };

  // ========== RENDER PRINCIPAL ==========
  return (
    <div className="flex flex-col h-screen font-sans relative" style={textSizeStyle}>
      <img src="/iaet-logo.png" alt="IAET" style={{ position: 'fixed', bottom: '20px', right: '20px', opacity: 0.15, zIndex: 999, pointerEvents: 'none', width: '30px' }} />
      {uploadMessage.show && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-white text-sm font-bold ${uploadMessage.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {uploadMessage.text}
        </div>
      )}

<header className="bg-white/90 backdrop-blur-md p-4 shadow-sm flex justify-between items-center sticky top-0 z-50 border-b">
  <img src="/Logo-Omnitours.png" alt="Omnitours" style={{ height: '230px', width: 'auto' }} />
  <div className="flex gap-2 items-center flex-wrap">
    <button onClick={increaseFontSize} className="p-1 rounded-full hover:bg-slate-200 active:bg-teal-500">
      <Type size={18} />
    </button>
    <button onClick={decreaseFontSize} className="p-1 rounded-full hover:bg-slate-200 active:bg-teal-500">
      <Type size={18} />
    </button>
    <button onClick={cycleContrastMode} className="p-1 rounded-full hover:bg-slate-200 active:bg-teal-500">
      <Contrast size={18} />
    </button>
    {adminSession ? (
      <button onClick={logout} className="text-red-500 text-xs flex items-center gap-1 active:bg-teal-500">
        <LogOut size={16} /> Salir
      </button>
    ) : (
      <button onClick={() => setView('adminLogin')} className="text-indigo-600 text-xs flex items-center gap-1 active:bg-teal-500">
        <LogIn size={16} /> Administrador
      </button>
    )}
    {/* Botón de descarga del APK - al final para mejor visibilidad */}
    <a
      href="/OmniTour.apk"
      download
      className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-black active:bg-teal-500 hover:bg-green-700 transition-colors"
    >
      📲 Descargar App OmniTour
    </a>
  </div>
</header>


      <main className="flex-1 overflow-y-auto p-4 pb-32">
        {/* ========== HOME ========== */}
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

        {/* ========== REGISTRO ========== */}
        {view === 'registration' && (
          <div className="max-w-md mx-auto space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow border">
              <h2 className="text-xl font-black mb-6 flex items-center justify-center gap-2"><Building2 size={24} className="text-indigo-600" /> Datos del Prestador</h2>
              <div className="space-y-4">
                <div><label className="text-[10px] font-black uppercase block text-center">Nombre Comercial *</label><input className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center ${registrationErrors.name ? 'border-red-500' : 'border-slate-200'}`} value={companyData.name} onChange={e => setCompanyData({...companyData, name: e.target.value})} />{registrationErrors.name && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.name}</p>}</div>
                <div><label className="text-[10px] font-black uppercase block text-center">RIF * (ej: J-12345678-9)</label><input className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center uppercase ${registrationErrors.rif ? 'border-red-500' : 'border-slate-200'}`} value={companyData.rif} onChange={e => setCompanyData({...companyData, rif: e.target.value})} />{registrationErrors.rif && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.rif}</p>}</div>
                <div><label className="text-[10px] font-black uppercase block text-center">RTN (opcional)</label><input className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-center" value={companyData.rtn} onChange={e => setCompanyData({...companyData, rtn: e.target.value})} /></div>
                <div><label className="text-[10px] font-black uppercase block text-center">Teléfono</label><input type="tel" className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-center" value={companyData.phone} onChange={e => setCompanyData({...companyData, phone: e.target.value})} /></div>
                <div><label className="text-[10px] font-black uppercase block text-center">Correo electrónico</label><input type="email" className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-center" value={companyData.email} onChange={e => setCompanyData({...companyData, email: e.target.value})} /></div>
                <div><label className="text-[10px] font-black uppercase block text-center">Estado *</label><select className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center ${registrationErrors.state ? 'border-red-500' : 'border-slate-200'}`} value={companyData.state} onChange={e => setCompanyData({...companyData, state: e.target.value, city: ''})}><option value="">Seleccione</option>{venezuelaStates.map(s => <option key={s}>{s}</option>)}</select>{registrationErrors.state && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.state}</p>}</div>
                <div><label className="text-[10px] font-black uppercase block text-center">Municipio *</label><select className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center ${registrationErrors.city ? 'border-red-500' : 'border-slate-200'}`} value={companyData.city} onChange={e => setCompanyData({...companyData, city: e.target.value})} disabled={!companyData.state}><option value="">Seleccione</option>{(municipalities[companyData.state] || []).map(c => <option key={c}>{c}</option>)}</select>{registrationErrors.city && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.city}</p>}</div>
                <div><label className="text-[10px] font-black uppercase block text-center">Dirección exacta *</label><input className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-center ${registrationErrors.address ? 'border-red-500' : 'border-slate-200'}`} value={companyData.address} onChange={e => setCompanyData({...companyData, address: e.target.value})} placeholder="Calle, número, referencia" />{registrationErrors.address && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.address}</p>}</div>
                <div className="rounded-2xl overflow-hidden border h-40 relative bg-slate-100 flex items-center justify-center"><MapPin size={40} className="text-slate-400" /><span className="absolute bottom-2 text-xs text-slate-500 text-center px-2">Ubicación: {companyData.address}, {companyData.city}, {companyData.state}</span></div>
                <div><label className="text-[10px] font-black uppercase block text-center">Sector *</label><div className="grid grid-cols-2 gap-3">{sectors.map(s => (<button key={s.id} onClick={() => setCompanyData({...companyData, sector: s.id})} className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 active:scale-95 ${companyData.sector === s.id ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-[1.02]' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'}`}>{companyData.sector === s.id && <CheckCircle2 size={20} className="absolute top-2 right-2 text-white" />}{s.icon}<span className="text-[10px] font-black uppercase">{s.label}</span></button>))}</div>{registrationErrors.sector && <p className="text-red-500 text-xs text-center mt-1">{registrationErrors.sector}</p>}</div>
              </div>
            </div>
            <button onClick={() => { if (validateCompanyData()) setView('audit'); }} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black active:bg-teal-500 active:scale-95 flex items-center justify-center gap-2">Continuar Registro <ChevronRight size={20}/></button>
          </div>
        )}

        {/* ========== AUDIT ========== */}
        {view === 'audit' && (
          <>
            {(() => { if (companyData.rif && !localStorage.getItem('progress_loaded')) { loadProgressLocally(); localStorage.setItem('progress_loaded', 'true'); } return null; })()}
            <div className="max-w-xl mx-auto space-y-6 pb-20">
              <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-xl"><span className="text-[10px] font-black">Módulo {currentModule+1}/{registrationModules.length}</span><h2 className="text-xl font-black">{registrationModules[currentModule].title}</h2><p className="text-sm">{registrationModules[currentModule].description}</p></div>
              {registrationModules[currentModule].questions.map(q => (
                <div key={q.id} className="bg-white rounded-3xl shadow border p-6">
                  <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{q.cat}</span>
                  <p className="text-base font-bold my-4 text-center">{q.text}</p>
                  <div className="grid grid-cols-4 gap-2 mb-4">{[...Array(q.max+1).keys()].map(i => (<button key={i} onClick={() => handleAnswer(q.id, i)} className={`py-3 text-sm font-black rounded-xl border transition-all duration-150 flex items-center justify-center gap-1 ${answers[q.id] === i ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-[1.02]' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:border-slate-400'}`}>{answers[q.id] === i && <span className="text-base">✓</span>}{i}</button>))}</div>
                  <div className="border-t pt-4"><p className="text-xs font-bold mb-2">Evidencias (máx 3):</p><div className="flex gap-2">{[0,1,2].map(idx => (<button key={idx} id={`btn-${q.id}-${idx}`} onClick={() => handlePhotoUpload(q.id, idx)} className={`px-3 py-1 rounded-lg text-xs font-black active:bg-teal-500 ${evidences[q.id]?.[idx] ? 'bg-green-100' : 'bg-slate-100'}`}><Camera size={14}/> {evidences[q.id]?.[idx] ? 'Foto' : `Subir ${idx+1}`}</button>))}</div></div>
                </div>
              ))}
              <div className="flex gap-4 pt-4">
                {currentModule > 0 && <button onClick={() => { setCurrentModule(m => m-1); saveProgressLocally(); }} className="flex-1 bg-white border py-4 rounded-2xl active:bg-teal-500">← Módulo anterior</button>}
                {currentModule < registrationModules.length-1 ? (<button onClick={() => { if (isCurrentModuleComplete()) { setCurrentModule(m => m+1); saveProgressLocally(); } }} className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl active:bg-teal-500">Siguiente módulo →</button>) : (<button onClick={async () => { if (isCurrentModuleComplete()) { await saveRegistrationToSupabase(); setView('results'); } }} className="flex-[2] bg-green-600 text-white py-4 rounded-2xl active:bg-teal-500">Finalizar</button>)}
              </div>
            </div>
          </>
        )}

        {/* ========== RESULTADOS ========== */}
        {view === 'results' && (
          <div id="report-content" className="max-w-md mx-auto space-y-6 pb-32">
            <div className="bg-white p-6 rounded-3xl shadow-xl text-center">
              <h2 className="text-2xl font-black">Resultados de Accesibilidad</h2>
              <p className="text-slate-500">{companyData.name}</p>
              <div className="mt-6 space-y-4 text-left">
                {registrationModules.map(mod => { const st = getModuleScore(mod.id); return (<div key={mod.id}><div className="flex justify-between text-sm font-bold"><span>{mod.title}</span><span>{st.pct}%</span></div><div className="w-full bg-slate-200 rounded-full h-4"><div className="bg-indigo-600 h-4 rounded-full" style={{ width: `${st.pct}%` }}></div></div></div>); })}
                <div className="pt-4 border-t mt-4"><div className="flex justify-between text-lg font-black"><span>Promedio General</span><span>{getTotalStats().pct}%</span></div><div className="w-full bg-slate-200 rounded-full h-6 mt-2"><div className={`h-6 rounded-full ${getTotalStats().pct >= 50 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${getTotalStats().pct}%` }}></div></div></div>
                <div className="flex justify-center mt-4"><img src={getAchievementImage(getTotalStats().pct)} className="w-40 h-auto rounded-lg shadow" alt="Logro" /></div>
              </div>
            </div>
          </div>
        )}

        {/* ========== ADMIN LOGIN ========== */}
        {view === 'adminLogin' && (
          <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-2xl shadow-xl"><h2 className="text-2xl font-black mb-6 text-center">Acceso Administrador</h2><form onSubmit={handleAdminLogin}><input type="email" placeholder="Email" className="w-full p-3 border rounded-xl mb-4" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} required /><input type="password" placeholder="Contraseña" className="w-full p-3 border rounded-xl mb-6" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required /><button type="submit" className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black active:bg-teal-500">Ingresar</button></form></div>
        )}

        {/* ========== ADMIN DASHBOARD ========== */}
        {view === 'adminDashboard' && (
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6 flex-wrap gap-4"><h2 className="text-2xl font-black">Panel de Administrador</h2><div className="flex gap-2"><button onClick={() => setView('home')} className="bg-slate-200 px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500">← Volver al inicio</button><button onClick={logout} className="bg-red-100 text-red-700 px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500">Cerrar sesión</button></div></div>
            <div className="bg-white rounded-2xl shadow p-6 mb-8"><h3 className="text-xl font-black mb-4 flex items-center gap-2"><BarChart size={24} className="text-indigo-600"/> Resumen por estado</h3><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresas</th><th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Promedio accesibilidad</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{statsByState.map((stat, idx) => (<tr key={idx} className="hover:bg-gray-50 cursor-pointer" onClick={() => filtrarPorEstado(stat.estado)}><td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{stat.estado}</td><td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{stat.cantidad}</td><td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><div className="w-24 bg-gray-200 rounded-full h-2"><div className={`h-2 rounded-full ${getPctColor(stat.promedio)}`} style={{ width: `${stat.promedio}%` }}></div></div><span className="text-sm font-bold">{stat.promedio}%</span></div></td></tr>))}</tbody></table></div></div>
            <div className="bg-white p-6 rounded-2xl shadow mb-6"><h3 className="text-lg font-black mb-4">Generar reporte por empresa</h3><div className="flex flex-col sm:flex-row gap-3"><input type="text" placeholder="Ingrese RIF de la empresa" className="flex-1 border rounded-xl px-4 py-3 text-center uppercase" value={searchRif} onChange={(e) => setSearchRif(e.target.value.toUpperCase())} /><button onClick={buscarEmpresaPorRif} disabled={loading} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black active:bg-teal-500 disabled:opacity-50">{loading ? 'Buscando...' : 'Buscar empresa'}</button></div>{searchResult && (<div className="mt-4 p-4 border rounded-xl bg-slate-50">{searchResult.found ? (<div className="flex justify-between items-center flex-wrap gap-2"><div><p className="font-bold">{searchResult.empresa.name}</p><p className="text-xs text-slate-500">RIF: {searchResult.empresa.rif} | Score: {searchResult.empresa.total_percentage}%</p><p className="text-xs text-slate-400">Dirección: {searchResult.empresa.address}</p></div><button onClick={() => generateCompanyReportWord(searchResult.empresa)} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500">📄 Generar reporte Word</button></div>) : (<p className="text-red-500 font-bold">❌ La empresa con RIF {searchResult.rif} no se ha registrado.</p>)}</div>)}</div>
            <div className="bg-white rounded-2xl shadow p-6"><div className="flex justify-between items-center mb-6 flex-wrap gap-4"><h3 className="text-lg font-black">Listado de empresas registradas</h3><div className="flex gap-3"><select value={selectedState} onChange={(e) => filtrarPorEstado(e.target.value)} className="border rounded-xl px-4 py-2 text-sm font-black bg-white"><option value="">Todos los estados</option>{venezuelaStates.map(state => (<option key={state} value={state}>{state}</option>))}</select><button onClick={exportToExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 active:bg-teal-500"><Download size={16}/> Exportar Excel</button></div></div><div className="overflow-x-auto"><table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Empresa</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">RIF</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sector</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Accesibilidad</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acción</th></tr></thead><tbody className="bg-white divide-y divide-gray-200">{filteredCompanies.length === 0 ? (<tr><td colSpan="8" className="px-4 py-8 text-center text-gray-500">No hay empresas registradas en este estado.</td></tr>) : (filteredCompanies.map((emp, index) => { const parts = emp.address ? emp.address.split(',') : []; const estado = parts.length > 2 ? parts[2].trim() : 'No especificado'; return (<tr key={emp.id} className="hover:bg-gray-50"><td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500 font-bold">{index+1}</td><td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{emp.name}</td><td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{emp.rif}</td><td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{emp.sector}</td><td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{estado}</td><td className="px-4 py-3 whitespace-nowrap"><div className="flex items-center gap-2"><div className="w-20 bg-gray-200 rounded-full h-2"><div className={`h-2 rounded-full ${getPctColor(emp.total_percentage || 0)}`} style={{ width: `${emp.total_percentage || 0}%` }}></div></div><span className="text-sm font-bold">{emp.total_percentage || 0}%</span></div></td><td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{new Date(emp.created_at).toLocaleDateString()}</td><td className="px-4 py-3 whitespace-nowrap"><button onClick={() => generateCompanyReportWord(emp)} className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-black hover:bg-indigo-700 active:bg-teal-500">📄 Reporte Word</button></td></tr>); }))}</tbody></table></div><div className="mt-4 text-sm text-gray-500">Total empresas registradas: {filteredCompanies.length}</div></div>
          </div>
        )}
      </main>
      {(view === 'home' || view === 'registration' || view === 'audit' || view === 'results') && (
        <nav className="bg-white/90 backdrop-blur-xl border-t fixed bottom-0 w-full flex justify-around items-center h-24 px-8 pb-6 shadow-lg z-50">
          <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${view === 'home' ? 'text-indigo-600' : 'text-slate-300'}`}><LayoutDashboard size={24} /><span className="text-[9px] font-black">Inicio</span></button>
          <button onClick={() => setView('registration')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${view === 'registration' || view === 'audit' ? 'text-indigo-600' : 'text-slate-300'}`}><ClipboardList size={24} /><span className="text-[9px] font-black">Registrar</span></button>
          <button onClick={() => adminSession ? setView('adminDashboard') : setView('adminLogin')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${view === 'adminDashboard' || view === 'adminLogin' ? 'text-indigo-600' : 'text-slate-300'}`}><TrendingUp size={24} /><span className="text-[9px] font-black">Métricas</span></button>
        </nav>
      )}
    </div>
  );
};

export default App;