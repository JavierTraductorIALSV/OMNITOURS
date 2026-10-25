import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, ClipboardList, Building2, Utensils, Plane,
  Bus, Palmtree, Library, Wind, MapPin, ArrowRight,
  Eye, Ear, Brain, Smartphone, ShieldAlert, FileText, Navigation,
  Globe, Umbrella, ChevronRight, Info, ShieldCheck, TrendingUp, Camera,
  LogIn, LogOut, Type, Contrast, CheckCircle2, Download, BarChart,
  HelpCircle, Award, Users, Shield, UserPlus, Trash2, Edit,
  AlertTriangle
} from 'lucide-react';
import { supabase, IS_PASSWORD_RECOVERY } from './supabaseClient';
import DisabilityPortal from './components/DisabilityPortal';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, Header, Table, TableRow, TableCell, WidthType, VerticalAlign } from 'docx';
import { jsPDF } from 'jspdf';
import fuenteCaligrafia from './assets/fuentes/GreatVibes-Regular.ttf';

import { getModulesBySector, calcularPorcentajesPorDiscapacidad, coberturaAuditoria, FichasPorDiscapacidad } from './catalogoAccesibilidad';

// ============================================
// FUNCIONES AUXILIARES
// ============================================
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

const dataURLToArrayBuffer = (dataURL) => {
  const base64 = dataURL.split(',')[1];
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return array.buffer;
};

// docx 7 necesita width Y height en transformation. Si falta el height escribe
// cy="NaN" en word/document.xml y Word rechaza el certificado completo con
// "existe un problema con el contenido". Se lee la dimensión real del archivo
// para escalar sin deformar la imagen.
const leerDimensionesImagen = (buffer) => {
  const u = new Uint8Array(buffer);
  if (u.length < 24) return null;
  if (u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47) {
    const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
    return { width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (u[0] === 0xff && u[1] === 0xd8) {
    let i = 2;
    while (i + 9 < u.length) {
      if (u[i] !== 0xff) { i += 1; continue; }
      const marker = u[i + 1];
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) { i += 2; continue; }
      const largo = (u[i + 2] << 8) | u[i + 3];
      const esSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (esSof) return { height: (u[i + 5] << 8) | u[i + 6], width: (u[i + 7] << 8) | u[i + 8] };
      i += 2 + largo;
    }
  }
  return null;
};

// Si no se pueden leer las dimensiones se usa un cuadrado: una imagen algo
// deformada sigue siendo un certificado que abre, y un NaN no.
const imagenEnReporte = (buffer, ancho) => {
  const d = leerDimensionesImagen(buffer);
  const alto = d && d.width > 0 && d.height > 0 ? Math.max(1, Math.round((ancho * d.height) / d.width)) : ancho;
  return new ImageRun({ data: buffer, transformation: { width: ancho, height: alto } });
};

// Un estático inexistente vuelve como 200 con el index.html por el _redirects de
// la SPA, y docx incrusta esos bytes tal cual como parte .png: Word rechaza el
// documento completo. Se valida la firma binaria antes de confiar en el cuerpo.
const fetchImagenValidada = async (url) => {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const esPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    const esJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
    return esPng || esJpeg ? buf : null;
  } catch {
    return null;
  }
};

const membreteOmniIaet = async () => {
  const [omni, iaet] = await Promise.all([
    fetchImagenValidada('/Logo-OmniTours.png'),
    fetchImagenValidada('/iaet-logo.png')
  ]);
  return new Header({
    children: [
      new Paragraph({
        children: [
          omni ? imagenEnReporte(omni, 100) : new TextRun(''),
          new TextRun('      '),
          iaet ? imagenEnReporte(iaet, 50) : new TextRun('')
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
      })
    ]
  });
};

// headers va al nivel de la sección, no dentro de properties: anidada ahí docx la
// ignora en silencio, no emite word/header1.xml y el membrete no se incrusta.
const documentoConMembrete = (sections, header) => new Document({
  sections: [{
    children: sections,
    headers: { default: header },
    properties: {
      page: { margin: { top: 2000, bottom: 2000, left: 2000, right: 2000 } }
    }
  }]
});

// btoa se atraganta con medio megabyte de una vez: se parte en bloques.
const aBase64 = (bytes) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

// jsPDF no acepta ArrayBuffer: quiere un data URL. Se reutiliza la validación de
// firma binaria del informe para no incrustar el index.html que devuelve el
// _redirects cuando el estático no existe.
const cargarAssetPdf = async (url) => {
  const buf = await fetchImagenValidada(url);
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  const esPng = bytes[0] === 0x89;
  return { data: `data:image/${esPng ? 'png' : 'jpeg'};base64,${aBase64(bytes)}`, formato: esPng ? 'PNG' : 'JPEG' };
};

// Un PDF de 4 MB no viaja por correo ni por WhatsApp: el logo pesa 1 MB y el trofeo
// medio, y ambos van colocados a 4 cm. Se reescalan a los píxeles que realmente
// pide una impresión a 300 ppp en ese tamaño (~500 px) antes de incrustarlos.
const redimensionarParaPdf = (asset, anchoMax, formato) => new Promise(resolve => {
  if (!asset) return resolve(null);
  const img = new Image();
  img.onload = () => {
    const escala = Math.min(1, anchoMax / img.width);
    if (escala === 1 && asset.formato === (formato === 'jpeg' ? 'JPEG' : 'PNG')) return resolve(asset);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    resolve({ data: canvas.toDataURL(`image/${formato}`, 0.9), formato: formato === 'jpeg' ? 'JPEG' : 'PNG' });
  };
  img.onerror = () => resolve(null);
  img.src = asset.data;
});

// El certificado se dibuja en milímetros sobre A4 apaisado. Los logos de
// Omnitours traen fondo azul marino opaco y el trofeo es una fotografía con fondo
// difuminado: no hay transparencia que recortar, así que cada pieza va enmarcada a
// propósito para que su fondo propio se lea como parte del diseño y no como un
// recuadro accidental sobre el crema.
const dibujarCertificado = (doc, d) => {
  const CREMA = [250, 244, 230];
  const PANEL = [255, 253, 246];
  const TINTA = [56, 40, 22];
  const ORO = [172, 138, 62];
  const ORO_OSCURO = [133, 104, 44];
  const SUAVE = [122, 102, 72];
  const NAVY = [4, 29, 49];
  const colorNivel = d.nivelTexto.startsWith('ORO') ? [168, 132, 42]
    : d.nivelTexto.startsWith('PLATA') ? [122, 126, 132]
      : [146, 94, 52];
  const centrado = (texto, x, y) => doc.text(texto, x, y, { align: 'center' });

  doc.setFillColor(...CREMA);
  doc.rect(0, 0, 297, 210, 'F');
  doc.setDrawColor(...ORO);
  doc.setLineWidth(0.5);
  doc.rect(6, 6, 285, 198);
  doc.setDrawColor(...ORO_OSCURO);
  doc.setLineWidth(1.6);
  doc.rect(8.5, 8.5, 280, 193);
  doc.setDrawColor(...ORO);
  doc.setLineWidth(0.5);
  doc.rect(11, 11, 275, 188);
  doc.setFillColor(...ORO_OSCURO);
  [[8.5, 8.5], [288.5, 8.5], [8.5, 201.5], [288.5, 201.5]].forEach(([x, y]) => doc.circle(x, y, 1.3, 'F'));

  if (d.imagenes.omni) {
    doc.setFillColor(...NAVY);
    doc.setDrawColor(...ORO);
    doc.setLineWidth(0.6);
    doc.rect(16, 16, 41.25, 30, 'FD');
    doc.addImage(d.imagenes.omni.data, d.imagenes.omni.formato, 16, 16, 41.25, 30);
  }
  if (d.imagenes.iaet) {
    doc.setFillColor(...PANEL);
    doc.setDrawColor(...ORO);
    doc.setLineWidth(0.6);
    doc.rect(226.4, 16, 54.6, 30, 'FD');
    doc.addImage(d.imagenes.iaet.data, d.imagenes.iaet.formato, 228.4, 18, 50.6, 26);
  }

  doc.setTextColor(...TINTA);
  doc.setFont('times', 'bold');
  doc.setFontSize(24);
  doc.setCharSpace(2.2);
  centrado('CERTIFICADO', 148.5, 28);
  doc.setFontSize(10.5);
  doc.setCharSpace(1.6);
  doc.setTextColor(...ORO_OSCURO);
  centrado('DE ACCESIBILIDAD TURÍSTICA', 148.5, 36);
  doc.setCharSpace(0);
  doc.setDrawColor(...ORO);
  doc.setLineWidth(0.4);
  doc.line(96, 40.5, 201, 40.5);
  doc.setFillColor(...ORO_OSCURO);
  doc.circle(148.5, 40.5, 0.9, 'F');

  doc.setFont('times', 'italic');
  doc.setFontSize(12);
  doc.setTextColor(...SUAVE);
  centrado('Omnitours e IAET otorgan el presente reconocimiento a', 148.5, 54);

  doc.setFont('GreatVibes', 'normal');
  doc.setTextColor(...TINTA);
  let tam = 40;
  doc.setFontSize(tam);
  while (tam > 22 && doc.getTextWidth(d.nombre) > 235) {
    tam -= 1;
    doc.setFontSize(tam);
  }
  centrado(d.nombre, 148.5, 72);
  doc.setDrawColor(...ORO);
  doc.setLineWidth(0.4);
  doc.line(118, 78, 179, 78);
  doc.setFillColor(...ORO_OSCURO);
  doc.circle(148.5, 78, 0.8, 'F');

  doc.setFont('times', 'normal');
  doc.setFontSize(12.5);
  doc.setTextColor(...TINTA);
  centrado('por haber superado la auditoría de accesibilidad turística', 105, 92);
  centrado('y acreditar el nivel de accesibilidad', 105, 99);
  doc.setFont('times', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...colorNivel);
  centrado(d.nivelTexto, 105, 110);
  doc.setDrawColor(...ORO);
  doc.setLineWidth(0.4);
  doc.line(60, 115, 150, 115);
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(...SUAVE);
  centrado(`RIF ${d.rif}  ·  Sector ${d.sector}`, 105, 125);
  centrado(`Emitido el ${d.emision}`, 105, 133);
  centrado(`Válido hasta ${d.vencimiento}`, 105, 140);
  doc.setFont('times', 'italic');
  doc.setFontSize(9);
  centrado('La vigencia está sujeta a que las condiciones auditadas se mantengan.', 105, 149);

  if (d.imagenes.trofeo) {
    doc.setFillColor(...PANEL);
    doc.setDrawColor(...ORO);
    doc.setLineWidth(0.8);
    doc.rect(204, 88, 49, 47.2, 'FD');
    doc.setLineWidth(0.4);
    doc.rect(205.2, 89.2, 46.6, 44.8);
    doc.addImage(d.imagenes.trofeo.data, d.imagenes.trofeo.formato, 206.5, 90.5, 44, 42.2);
  }
  doc.setFont('times', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...colorNivel);
  centrado(`${d.pct}%`, 228.5, 147);
  doc.setFontSize(8);
  doc.setCharSpace(1.2);
  doc.setTextColor(...ORO_OSCURO);
  centrado('CUMPLIMIENTO GENERAL', 228.5, 153);
  doc.setCharSpace(0);
  doc.setDrawColor(...ORO);
  doc.setLineWidth(0.4);
  doc.line(210, 157.5, 247, 157.5);

  doc.setDrawColor(...TINTA);
  doc.setLineWidth(0.4);
  doc.line(45, 178, 105, 178);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...TINTA);
  centrado(d.firmante, 75, 183);
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...SUAVE);
  centrado(d.cargo, 75, 188.5);

  doc.setDrawColor(...ORO_OSCURO);
  doc.setLineWidth(0.8);
  doc.circle(148.5, 176, 14, 'S');
  doc.setDrawColor(...ORO);
  doc.setLineWidth(0.4);
  doc.circle(148.5, 176, 11, 'S');
  doc.setFont('times', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(...ORO_OSCURO);
  centrado('OMNITOURS · IAET', 148.5, 172.5);
  doc.setFontSize(6);
  centrado('ACCESIBILIDAD', 148.5, 177.5);
  centrado('TURÍSTICA', 148.5, 181.5);
  doc.setFontSize(5.5);
  centrado('VENEZUELA', 148.5, 185.5);

  doc.setFontSize(7);
  doc.setCharSpace(1);
  doc.setTextColor(...ORO_OSCURO);
  centrado('FOLIO', 228.5, 175);
  doc.setCharSpace(0);
  doc.setFontSize(12);
  doc.setTextColor(...TINTA);
  centrado(d.rif, 228.5, 181);
  doc.setFont('times', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...SUAVE);
  centrado(`Emitido por Omnitours e IAET · ${new Date().getFullYear()}`, 228.5, 187);
};

// El nivel se decide con el promedio de los porcentajes por módulo. Es el mismo
// criterio para el informe y para el certificado: si cada documento usara el suyo
// (total_percentage es puntos sobre el máximo, no promedio de módulos) podrían
// contradecirse para la misma empresa.
const puntajesPorModulo = (sector, respuestasMap) =>
  getModulesBySector(sector).map(mod => {
    let score = 0, max = 0;
    mod.questions.forEach(q => {
      score += respuestasMap[q.id] || 0;
      max += q.max;
    });
    return { name: mod.title, pct: max === 0 ? 0 : Math.round((score / max) * 100) };
  });

const promedioDeModulos = (moduleScores) =>
  moduleScores.length ? moduleScores.reduce((acc, m) => acc + m.pct, 0) / moduleScores.length : 0;

// certificable marca hasta dónde se emite certificado: por decisión del usuario
// solo los tres niveles superiores. Normal e Inaccesible no acreditan nada.
const nivelDeAccesibilidad = (totalPct) => {
  if (totalPct >= 85) return { texto: 'ORO (Excelente)', trofeo: '/Oro.png', certificable: true };
  if (totalPct >= 75) return { texto: 'PLATA (Muy Bueno)', trofeo: '/plata.png', certificable: true };
  if (totalPct >= 60) return { texto: 'BRONCE (Bueno)', trofeo: '/Bronce.png', certificable: true };
  if (totalPct >= 50) return { texto: 'NORMAL (Básico)', trofeo: '/Normal.png', certificable: false };
  return { texto: 'INACCESIBLE (Crítico)', trofeo: '/inaccesibilidad.png', certificable: false };
};

const fechaLarga = (d) => d.toLocaleDateString('es-VE', { day: 'numeric', month: 'long', year: 'numeric' });

// total_score y total_percentage son puntos obtenidos sobre el máximo del sector,
// igual que getTotalStats(). No es el promedio de módulos que usan el informe y el
// certificado: si al editar se recalcula con otro criterio, la tabla del admin y el
// portal pasarían a mostrar un nivel distinto del que venían mostrando.
const totalesDelCatalogo = (sector, respuestas) => {
  let score = 0, max = 0;
  getModulesBySector(sector).forEach(m => m.questions.forEach(q => {
    const v = respuestas ? respuestas[q.id] : undefined;
    if (typeof v === 'number') score += v;
    max += q.max;
  }));
  return { score, max, pct: max === 0 ? 0 : Math.round((score / max) * 100) };
};

// ============================================
// COMPONENTE PRINCIPAL
// ============================================
const App = () => {
  // ========== ESTADOS DE AUTENTICACIÓN ==========
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState('user');
  const [allUsers, setAllUsers] = useState([]);
  const [authView, setAuthView] = useState('login');
  // Al arrancar desde un enlace de recuperación hay que montar el portal de una vez:
  // la lógica de montaje decide según disability_users, y un usuario cuyo registro
  // anterior falló no tiene fila ahí, por lo que nunca llegaría a cambiar su contraseña.
  const [showDisabilityPortal, setShowDisabilityPortal] = useState(IS_PASSWORD_RECOVERY);
  const [visitCount, setVisitCount] = useState(0);

  // ========== ESTADOS DE ACCESIBILIDAD ==========
  // Se leen en el inicializador y no en un efecto para que la app no pinte un
  // render con los valores por defecto antes de aplicar los preferidos.
  // El try/catch no es adorno: localStorage lanza en navegación privada y un
  // error dentro del inicializador dejaría la app en blanco.
  const [contrastMode, setContrastMode] = useState(() => {
    try {
      return localStorage.getItem('omnitour_contrast') || 'normal-contrast';
    } catch (e) {
      return 'normal-contrast';
    }
  });
  const [fontSizeMultiplier, setFontSizeMultiplier] = useState(() => {
    try {
      const guardado = parseFloat(localStorage.getItem('omnitour_font_size'));
      // Mismo rango que imponen los botones de aumentar/reducir
      return Number.isFinite(guardado) ? Math.min(Math.max(guardado, 0.8), 2) : 1;
    } catch (e) {
      return 1;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('omnitour_contrast', contrastMode);
      localStorage.setItem('omnitour_font_size', String(fontSizeMultiplier));
    } catch (e) {
      console.warn('No se pudieron guardar las preferencias de accesibilidad');
    }
  }, [contrastMode, fontSizeMultiplier]);

  // ========== ESTADOS PRINCIPALES ==========
  const [view, setView] = useState('home');
  const mainRef = useRef(null);
  const viewYaMontada = useRef(false);
  const [currentModule, setCurrentModule] = useState(0);
  const [currentQuestionPage, setCurrentQuestionPage] = useState(0);
  const [answers, setAnswers] = useState({});
  const [evidences, setEvidences] = useState({});
  const [companyData, setCompanyData] = useState({
    name: '', rif: '', rtn: '', date: new Date().toISOString().split('T')[0],
    sector: '', address: '', city: '', state: '', phone: '', email: ''
  });
  const [allCompanies, setAllCompanies] = useState([]);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [respuestasPorEmpresa, setRespuestasPorEmpresa] = useState({});
  const [selectedState, setSelectedState] = useState('');
  const [statsByState, setStatsByState] = useState([]);
  const [uploadMessage, setUploadMessage] = useState({ show: false, text: '', type: '' });
  const [searchRif, setSearchRif] = useState('');
  const [searchResult, setSearchResult] = useState(null);
  const [loadingSearch, setLoadingSearch] = useState(false);
  // ========== EDICIÓN Y BORRADO DE EMPRESAS (solo admin) ==========
  const [empresaEnEdicion, setEmpresaEnEdicion] = useState(null);
  const [edicionDatos, setEdicionDatos] = useState({});
  const [edicionRespuestas, setEdicionRespuestas] = useState({});
  const [respuestasOriginales, setRespuestasOriginales] = useState({});
  const [cargandoEdicion, setCargandoEdicion] = useState(false);
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);
  const [empresaABorrar, setEmpresaABorrar] = useState(null);
  const [rifConfirmacion, setRifConfirmacion] = useState('');
  const [borrando, setBorrando] = useState(false);
  const modalRef = useRef(null);
  const botonDisparadorRef = useRef(null);
  const [registrationErrors, setRegistrationErrors] = useState({});
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [registrationModules, setRegistrationModules] = useState([]);

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
    { id: 'alojamiento', label: 'Alojamiento', icon: <Building2 size={24} />, description: 'Hoteles, posadas, hostales' },
    { id: 'restaurante', label: 'Restaurante', icon: <Utensils size={24} />, description: 'Restaurantes, bares, comedores' },
    { id: 'agencia', label: 'Agencia de Viaje', icon: <Plane size={24} />, description: 'Agencias, operadores turísticos' },
    { id: 'transporte', label: 'Transporte', icon: <Bus size={24} />, description: 'Vehículos, vans, autobuses' },
    { id: 'museo', label: 'Museo / Patrimonio', icon: <Library size={24} />, description: 'Museos, sitios patrimoniales' },
    { id: 'aereo', label: 'Transporte Aéreo', icon: <Wind size={24} />, description: 'Líneas aéreas, charters' },
    { id: 'recreacional', label: 'Recreacional', icon: <Palmtree size={24} />, description: 'Parques, atracciones, entretenimiento' },
    { id: 'playa', label: 'Servicios de Playa', icon: <Umbrella size={24} />, description: 'Balnearios, servicios playeros' },
  ];

  // ============================================================
  // ✅ CONTADOR DE VISITAS LOCAL (sin Supabase)
  // ============================================================
  useEffect(() => {
    try {
      const stored = localStorage.getItem('omnitour_visits') || '0';
      const count = parseInt(stored, 10) + 1;
      localStorage.setItem('omnitour_visits', count.toString());
      setVisitCount(count);
    } catch (e) {
      console.warn('No se pudo acceder al contador local');
      setVisitCount(1);
    }
  }, []);

  // ============================================================
  // ✅ FOCO AL CAMBIAR DE PANTALLA (WCAG 2.4.3)
  // ============================================================
  // Sin router: cada setView desmonta el botón que originó el cambio, así que
  // el foco cae al <body> y el lector de pantalla no se entera de que hay una
  // pantalla nueva. Se devuelve el foco al contenedor principal, que es el
  // mismo destino del enlace "Saltar al contenido principal".
  // El primer render se omite a propósito: robar el foco al cargar la app
  // impediría empezar a leer desde la cabecera.
  // También se escucha showDisabilityPortal: volver del portal remonta todo el
  // shell sin cambiar `view`, y el botón "Volver" que originó el regreso ya no
  // existe. Al abrirse el portal el efecto corre igual, pero mainRef es null
  // porque <main> está desmontado y el guard lo descarta.
  useEffect(() => {
    if (!viewYaMontada.current) {
      viewYaMontada.current = true;
      return;
    }
    const node = mainRef.current;
    if (!node) return;
    node.focus({ preventScroll: true });
    node.scrollTo({ top: 0 });
  }, [view, showDisabilityPortal]);

  // Un modal tiene que recibir el foco al abrirse y cerrarse con Esc: si no, el
  // foco se queda en el botón de la tabla, detrás del overlay (WCAG 2.4.3).
  const modalAbierto = Boolean(empresaEnEdicion || empresaABorrar);
  useEffect(() => {
    if (!modalAbierto) return;
    const nodo = modalRef.current;
    if (nodo) nodo.focus({ preventScroll: true });
    const alPresionar = (e) => {
      if (e.key === 'Escape') {
        if (empresaABorrar) cerrarBorradoEmpresa();
        else if (empresaEnEdicion && !guardandoEdicion) cerrarEdicionEmpresa();
        return;
      }
      if (e.key !== 'Tab' || !nodo) return;
      // aria-modal anuncia que el fondo está inerte, pero sin trampa el Tab sigue
      // recorriendo la tabla que quedó detrás del overlay. Dentro del modal no hay
      // controles ocultos: los deshabilitados ya quedan fuera del selector.
      const focales = Array.from(nodo.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));
      if (!focales.length) return;
      const primero = focales[0];
      const ultimo = focales[focales.length - 1];
      const activo = document.activeElement;
      const afuera = !nodo.contains(activo);
      if (e.shiftKey && (afuera || activo === primero)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && (afuera || activo === ultimo)) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alPresionar);
    return () => document.removeEventListener('keydown', alPresionar);
  }, [modalAbierto, empresaABorrar, empresaEnEdicion, guardandoEdicion]);

  // ============================================================
  // ✅ AUTENTICACIÓN (EMPRESAS/ADMIN vs DISCAPACIDAD)
  // ============================================================
// ============================================================
// ✅ AUTENTICACIÓN (con timeouts internos)
// ============================================================
useEffect(() => {
  let isMounted = true;
  let hardTimeout = null;
  let authChangeTimeout = null;

  const checkIfDisabilityUser = async (userId) => {
    try {
      const { data } = await supabase
        .from('disability_users')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();
      return !!data;
    } catch (e) {
      return false;
    }
  };

  // Timeout de seguridad global: si en 4s no cargó nada, mostrar login
  hardTimeout = setTimeout(() => {
    if (isMounted) {
      console.warn('⚠️ Autenticación lenta. Mostrando pantalla de login.');
      setLoading(false);
    }
  }, 4000);

  const initAuth = async () => {
    try {
      // 🔒 Timeout específico para getSession (máximo 3s)
      const sessionResult = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), 3000)
        ),
      ]);

      const session = sessionResult?.data?.session;

      if (!session) {
        // No hay sesión activa → login
        if (isMounted) {
          clearTimeout(hardTimeout);
          setLoading(false);
        }
        return;
      }

      // 🔒 Timeout para verificación de discapacidad (máximo 2s)
      let isDisability = false;
      try {
        isDisability = await Promise.race([
          checkIfDisabilityUser(session.user.id),
          new Promise((resolve) => setTimeout(() => resolve(false), 2000)),
        ]);
      } catch (e) {
        isDisability = false;
      }

      if (isDisability) {
        if (isMounted) {
          setShowDisabilityPortal(true);
          clearTimeout(hardTimeout);
          setLoading(false);
        }
        return;
      }

      // Usuario empresa/admin
      if (isMounted) {
        setSession(session);
        setUser(session.user);

        try {
          await Promise.race([
            obtenerRol(session.user.id),
            new Promise((resolve) => setTimeout(() => resolve(), 2000)),
          ]);
        } catch (e) {
          setUserRole('user');
        }

        clearTimeout(hardTimeout);
        setLoading(false);
      }
    } catch (err) {
      console.warn('Auth error (ignorado):', err.message);
      if (isMounted) {
        clearTimeout(hardTimeout);
        setLoading(false);
      }
    }
  };

  initAuth();

  const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
    if (authChangeTimeout) clearTimeout(authChangeTimeout);
    authChangeTimeout = setTimeout(async () => {
      if (event === 'SIGNED_IN' && session) {
        let isDisability = false;
        try {
          isDisability = await checkIfDisabilityUser(session.user.id);
        } catch (e) {}
        if (isDisability) {
          setSession(null);
          setUser(null);
          setUserRole(null);
          setShowDisabilityPortal(true);
        } else {
          setSession(session);
          setUser(session.user);
          try { await obtenerRol(session.user.id); } catch(e) { setUserRole('user'); }
          setView('home');
        }
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
        setUser(null);
        setUserRole(null);
        setView('home');
        setShowDisabilityPortal(false);
      }
      if (isMounted) setLoading(false);
    }, 300);
  });

  return () => {
    isMounted = false;
    if (hardTimeout) clearTimeout(hardTimeout);
    if (authChangeTimeout) clearTimeout(authChangeTimeout);
    authListener?.subscription?.unsubscribe();
  };
}, []);


  const obtenerRol = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        setUserRole('user');
        return;
      }
      if (data) {
        setUserRole(data.role);
      } else {
        await supabase
          .from('profiles')
          .insert({ id: userId, email: user?.email || '', role: 'user' });
        setUserRole('user');
      }
    } catch (error) {
      setUserRole('user');
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) {
        alert('Error al iniciar sesión: ' + error.message);
      } else {
        setLoginEmail('');
        setLoginPassword('');
      }
    } catch (error) {
      alert('Error al iniciar sesión: ' + error.message);
    }
    setLoading(false);
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    setSession(null);
    setUser(null);
    setUserRole(null);
    setView('home');
    setShowDisabilityPortal(false);
  };

  const handleRegisterUser = async (e) => {
    e.preventDefault();
    if (!newUserEmail || !newUserPassword) {
      alert('Ingrese email y contraseña');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: newUserEmail,
      password: newUserPassword,
    });
    if (error) {
      alert('Error al crear usuario: ' + error.message);
      setLoading(false);
      return;
    }
    if (data.user) {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert({
          id: data.user.id,
          email: newUserEmail,
          role: newUserRole || 'user',
        });
      if (profileError) {
        alert('Error al crear perfil: ' + profileError.message);
      } else {
        alert('Usuario creado exitosamente');
        setNewUserEmail('');
        setNewUserPassword('');
        setNewUserRole('user');
        await cargarUsuarios();
      }
    }
    setLoading(false);
  };

  const cambiarRolUsuario = async (userId, newRole) => {
    if (userRole !== 'admin') return;
    const { error } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);
    if (error) {
      alert('Error al cambiar rol: ' + error.message);
    } else {
      await cargarUsuarios();
    }
  };

  const eliminarUsuario = async (userId) => {
    if (userRole !== 'admin') return;
    if (!window.confirm('¿Eliminar este usuario? Las empresas quedarán sin usuario asignado.')) return;
    try {
      await supabase.from('companies').update({ user_id: null }).eq('user_id', userId);
      const { error } = await supabase.from('profiles').delete().eq('id', userId);
      if (error) throw error;
      await cargarUsuarios();
      alert('Usuario eliminado correctamente.');
    } catch (error) {
      alert('Error al eliminar usuario: ' + error.message);
    }
  };

  // Al cerrar un modal el foco vuelve al botón que lo abrió. Si la fila se borró
  // ese botón ya no está en el documento y no hay nada a lo que volver.
  const devolverFocoAlDisparador = () => {
    const boton = botonDisparadorRef.current;
    botonDisparadorRef.current = null;
    if (boton && document.contains(boton)) boton.focus();
  };

  // Las respuestas se piden frescas al abrir el modal en vez de reutilizar
  // respuestasPorEmpresa: si esa consulta hubiera fallado el mapa vendría vacío,
  // todo parecería sin responder y al guardar se insertarían filas duplicadas
  // para preguntas que sí tienen respuesta guardada.
  const abrirEdicionEmpresa = async (empresa, boton) => {
    if (userRole !== 'admin') return;
    // Los dos modales comparten modalRef y botonDisparadorRef: si se abrieran a la
    // vez, al cerrar uno el foco volvería al disparador del otro y Esc cerraría
    // cualquiera de los dos.
    if (modalAbierto) return;
    botonDisparadorRef.current = boton || null;
    // companies.address guarda "dirección, municipio, estado" en una sola columna
    // (así lo compone el insert del registro). Se parte de derecha a izquierda:
    // municipio y estado vienen de listas cerradas sin comas, así que los dos
    // últimos tramos son siempre esos aunque la dirección libre traiga comas.
    const tramos = (empresa.address || '').split(',');
    const bienFormada = tramos.length >= 3;
    setEdicionDatos({
      name: empresa.name || '',
      rif: empresa.rif || '',
      rtn: empresa.rtn || '',
      address: bienFormada ? tramos.slice(0, -2).join(',').trim() : (empresa.address || ''),
      city: bienFormada ? tramos[tramos.length - 2].trim() : '',
      state: bienFormada ? tramos[tramos.length - 1].trim() : '',
      phone: empresa.phone || '',
      email: empresa.email || ''
    });
    setEmpresaEnEdicion(empresa);
    setCargandoEdicion(true);
    setEdicionRespuestas({});
    setRespuestasOriginales({});
    try {
      const { data, error } = await supabase.from('answers')
        .select('question_id, score').eq('company_id', empresa.id);
      if (error) throw error;
      const mapa = {};
      (data || []).forEach(r => { mapa[r.question_id] = r.score; });
      setRespuestasOriginales(mapa);
      setEdicionRespuestas({ ...mapa });
    } catch (error) {
      alert('No se pudieron cargar las respuestas guardadas: ' + error.message + '\n\nCierre el modal sin guardar para no pisar la auditoría.');
      setCargandoEdicion(false);
      return;
    }
    setCargandoEdicion(false);
  };

  const cerrarEdicionEmpresa = () => {
    setEmpresaEnEdicion(null);
    setEdicionDatos({});
    setEdicionRespuestas({});
    setRespuestasOriginales({});
    devolverFocoAlDisparador();
  };

  const guardarEdicionEmpresa = async () => {
    if (!empresaEnEdicion || guardandoEdicion) return;
    if (!edicionDatos.name || !edicionDatos.name.trim()) {
      alert('El nombre de la empresa no puede quedar vacío.');
      return;
    }
    if (!edicionDatos.rif || !edicionDatos.rif.trim()) {
      alert('El RIF no puede quedar vacío.');
      return;
    }
    setGuardandoEdicion(true);
    const id = empresaEnEdicion.id;
    try {
      // Se comparan las claves de ambos mapas para que también cuenten las
      // respuestas que se dejaron en "Sin responder": esas no aparecen en
      // edicionRespuestas y hay que borrarlas de la base.
      const tocadas = Object.keys({ ...respuestasOriginales, ...edicionRespuestas })
        .filter(qId => edicionRespuestas[qId] !== respuestasOriginales[qId]);
      const aInsertar = tocadas
        .filter(qId => typeof edicionRespuestas[qId] === 'number')
        .map(qId => ({ company_id: id, question_id: qId, score: edicionRespuestas[qId] }));

      // Se borran solo las preguntas que cambiaron y se reinsertan. Se evita el
      // upsert porque exigiría una restricción única (company_id, question_id)
      // que no consta en ningún lado del repo.
      if (tocadas.length) {
        const { error: eBorrado } = await supabase.from('answers')
          .delete().eq('company_id', id).in('question_id', tocadas);
        if (eBorrado) throw eBorrado;
        if (aInsertar.length) {
          const { error: eInsert } = await supabase.from('answers').insert(aInsertar);
          if (eInsert) throw eInsert;
        }
      }

      const totales = totalesDelCatalogo(empresaEnEdicion.sector, edicionRespuestas);
      const { error: eEmpresa } = await supabase.from('companies').update({
        name: edicionDatos.name.trim(),
        rif: edicionDatos.rif.trim().toUpperCase(),
        rtn: edicionDatos.rtn,
        address: [edicionDatos.address, edicionDatos.city, edicionDatos.state]
          .map(parte => (parte || '').trim()).filter(Boolean).join(', '),
        phone: edicionDatos.phone,
        email: edicionDatos.email,
        total_score: totales.score,
        total_percentage: totales.pct,
        updated_at: new Date().toISOString()
      }).eq('id', id);
      if (eEmpresa) throw eEmpresa;

      const resumen = `✅ Registro actualizado.\n\n${edicionDatos.name.trim()}\nPuntaje: ${totales.score} de ${totales.max} (${totales.pct}%)\nRespuestas modificadas: ${tocadas.length}`;
      cerrarEdicionEmpresa();
      await cargarEmpresas();
      alert(resumen);
    } catch (error) {
      alert('Error al guardar los cambios: ' + error.message);
    } finally {
      setGuardandoEdicion(false);
    }
  };

  const abrirBorradoEmpresa = (empresa, boton) => {
    if (userRole !== 'admin') return;
    if (modalAbierto) return;
    botonDisparadorRef.current = boton || null;
    setRifConfirmacion('');
    setEmpresaABorrar(empresa);
  };

  const cerrarBorradoEmpresa = () => {
    setEmpresaABorrar(null);
    setRifConfirmacion('');
    devolverFocoAlDisparador();
  };

  // Borra solo la fila de companies, por decisión explícita del usuario: las
  // respuestas en answers, las filas de evidences y las fotos del bucket
  // evidencias quedan huérfanas y las fotos siguen siendo públicas en su URL.
  // La cuenta de usuario vinculada no se toca.
  const confirmarBorradoEmpresa = async () => {
    if (!empresaABorrar || borrando) return;
    if (rifConfirmacion.trim().toUpperCase() !== (empresaABorrar.rif || '').toUpperCase()) return;
    setBorrando(true);
    const nombre = empresaABorrar.name;
    const id = empresaABorrar.id;
    try {
      const { error } = await supabase.from('companies').delete().eq('id', id);
      if (error) throw error;
      cerrarBorradoEmpresa();
      await cargarEmpresas();
      alert(`Empresa "${nombre}" eliminada.\n\nSus respuestas y sus fotos de evidencia no se borran: quedan en la base y en Storage.`);
    } catch (error) {
      alert('Error al eliminar la empresa: ' + error.message);
    } finally {
      setBorrando(false);
    }
  };

  // Se derivan en el render en vez de vivir en estado: dependen de
  // empresaEnEdicion y edicionRespuestas, y un efecto que los sincronizara
  // pintaría un frame con los totales viejos cada vez que se toca una respuesta.
  const modulosEdicion = empresaEnEdicion ? getModulesBySector(empresaEnEdicion.sector) : [];
  const totalesEdicion = empresaEnEdicion
    ? totalesDelCatalogo(empresaEnEdicion.sector, edicionRespuestas)
    : { score: 0, max: 0, pct: 0 };
  const nivelEdicion = nivelDeAccesibilidad(totalesEdicion.pct);
  const respuestasCambias = Object.keys({ ...respuestasOriginales, ...edicionRespuestas })
    .filter(qId => edicionRespuestas[qId] !== respuestasOriginales[qId]).length;
  const rifConfirmado = Boolean(empresaABorrar) &&
    rifConfirmacion.trim().toUpperCase() === (empresaABorrar?.rif || '').toUpperCase();

  // El resto de la app repite los literales de contraste en cada control, pero los
  // modales de empresas tienen decenas de campos y la repetición no se podía leer.
  const fondoModal = contrastMode === 'high-contrast'
    ? 'bg-black border-2 border-white text-white'
    : contrastMode === 'yellow-on-black'
      ? 'bg-black border-2 border-yellow-300 text-yellow-300'
      : 'bg-white text-slate-800';
  const campoModal = contrastMode === 'high-contrast'
    ? 'bg-black text-white border-white'
    : contrastMode === 'yellow-on-black'
      ? 'bg-black text-yellow-300 border-yellow-300'
      : 'bg-slate-50 border-slate-200';

  const enviarResetPassword = async (email) => {
    if (userRole !== 'admin') return;
    if (!email) return;
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/reset-password',
      });
      if (error) throw error;
      alert(`Se ha enviado un enlace de restablecimiento a ${email}`);
    } catch (error) {
      alert('Error al enviar enlace: ' + error.message);
    }
  };

  const cargarEmpresas = async (userId) => {
    const uid = userId || user?.id;
    if (!uid) {
      setAllCompanies([]);
      setFilteredCompanies([]);
      return;
    }
    try {
      let query = supabase.from('companies').select('*').order('created_at', { ascending: false });
      if (userRole !== 'admin') {
        query = query.eq('user_id', uid);
      }
      const { data, error } = await query;
      if (error) throw error;
      setAllCompanies(data || []);
      setFilteredCompanies(data || []);
      calcularStatsPorEstado(data || []);
      cargarRespuestasPorEmpresa((data || []).map(c => c.id));
    } catch (error) {
      console.error('Error cargando empresas:', error);
      setAllCompanies([]);
      setFilteredCompanies([]);
    }
  };

  // Se pide acotado a las empresas ya cargadas: un usuario de empresa no debe
  // traer las respuestas de todo el proyecto solo para pintar su tabla.
  const cargarRespuestasPorEmpresa = async (ids) => {
    if (!ids.length) {
      setRespuestasPorEmpresa({});
      return;
    }
    try {
      const { data, error } = await supabase
        .from('answers')
        .select('company_id, question_id, score')
        .in('company_id', ids);
      if (error) throw error;
      const agrupadas = {};
      (data || []).forEach(r => {
        if (!agrupadas[r.company_id]) agrupadas[r.company_id] = {};
        agrupadas[r.company_id][r.question_id] = r.score;
      });
      setRespuestasPorEmpresa(agrupadas);
    } catch (error) {
      console.error('Error cargando respuestas:', error);
    }
  };

  const cargarUsuarios = async () => {
    if (userRole !== 'admin') return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAllUsers(data || []);
    } catch (error) {
      console.error('Error cargando usuarios:', error);
      setAllUsers([]);
    }
  };

  const buscarEmpresaPorRif = async () => {
    if (!searchRif.trim()) { alert('Ingrese un RIF válido'); return; }
    setLoadingSearch(true);
    const rifUpper = searchRif.trim().toUpperCase();
    let query = supabase.from('companies').select('*').eq('rif', rifUpper);
    if (userRole !== 'admin') {
      query = query.eq('user_id', user?.id);
    }
    const { data, error } = await query.maybeSingle();
    setLoadingSearch(false);
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
        'Fecha Registro': new Date(emp.created_at).toLocaleDateString(),
        'Registrado por': emp.user_id || 'Desconocido'
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

  const getModuleScore = (moduleId) => {
    const mod = getCurrentModules().find(m => m.id === moduleId);
    if (!mod) return { score: 0, max: 1, pct: 0 };
    let score = 0, max = 0;
    mod.questions.forEach(q => {
      score += (answers[q.id] || 0);
      max += q.max;
    });
    return { score, max, pct: Math.round((score / max) * 100) || 0 };
  };

  const getTotalStats = () => {
    const modules = getCurrentModules();
    let totalScore = 0, totalMax = 0;
    modules.forEach(m => {
      const s = getModuleScore(m.id);
      totalScore += s.score;
      totalMax += s.max;
    });
    const pct = totalMax === 0 ? 0 : Math.round((totalScore / totalMax) * 100);
    return { score: totalScore, max: totalMax, pct };
  };

  const getCurrentModules = () => {
    if (registrationModules.length > 0) return registrationModules;
    if (companyData.sector) {
      return getModulesBySector(companyData.sector);
    }
    return [];
  };

  const getAchievementImage = (pct) => {
    if (pct >= 85) return '/Oro.png';
    if (pct >= 75) return '/plata.png';
    if (pct >= 60) return '/Bronce.png';
    if (pct >= 50) return '/Normal.png';
    return '/inaccesibilidad.png';
  };

  const isCurrentModuleComplete = () => {
    const modules = getCurrentModules();
    if (modules.length === 0) return false;
    const currentMod = modules[currentModule];
    if (!currentMod) return false;
    const missingQuestions = currentMod.questions.filter(q => answers[q.id] === undefined);
    if (missingQuestions.length > 0) {
      const missingList = missingQuestions.map((q, idx) => `${idx + 1}. ${q.text}`).join('\n');
      alert(`❌ Faltan ${missingQuestions.length} pregunta(s) por responder en este módulo:\n\n${missingList}`);
      return false;
    }
    return true;
  };

  const getQuestionText = (qId) => {
    const modules = getCurrentModules();
    for (let mod of modules) {
      const q = mod.questions.find(q => q.id === qId);
      if (q) return q.text;
    }
    return '';
  };

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
        if (savedCompany.sector) {
          const mods = getModulesBySector(savedCompany.sector);
          setRegistrationModules(mods);
        }
        alert('✅ Se ha recuperado el progreso guardado.');
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

  const handleAnswer = (qId, val) => {
    setAnswers(prev => ({ ...prev, [qId]: val }));
    saveProgressLocally();
    if (!navigator.onLine) {
      saveAnswerOffline(qId, val);
      alert('📡 Sin conexión. La respuesta se guardará localmente.');
    }
  };

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
      setUploadMessage({ show: true, text: '📡 Sin conexión. Se guardará localmente.', type: 'info' });
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
    setEvidences(prev => {
      const current = prev[qId] || [];
      const updated = [...current];
      updated[photoIndex] = { url: photoUrl };
      return { ...prev, [qId]: updated };
    });
    setUploadMessage({ show: true, text: '✅ Archivo guardado', type: 'success' });
    if (btn) btn.innerHTML = '✓ Foto';
    setTimeout(() => setUploadMessage({ show: false, text: '', type: '' }), 2000);
    saveProgressLocally();
  };

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

  const sendCompanyReportEmail = async (company, reportBlob) => {
    console.log('Reporte generado, pendiente de envío por correo.');
  };

  const saveRegistrationToSupabase = async () => {
    try {
      const userId = user?.id;
      if (!userId) {
        alert('No se pudo identificar al usuario');
        return;
      }

      if (!navigator.onLine) {
        const pendingRegistration = { companyData, answers, evidences, user_id: userId, timestamp: Date.now() };
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
          user_id: userId,
        })
        .select()
        .maybeSingle();
      if (companyError) throw companyError;

      const answersToInsert = Object.entries(answers).map(([qId, value]) => ({ company_id: company.id, question_id: qId, score: value }));
      if (answersToInsert.length) await supabase.from('answers').insert(answersToInsert);

      const evidencesToInsert = Object.entries(evidences).flatMap(([qId, photos]) =>
        photos.filter(p => p && p.url).map(p => ({
          company_id: company.id,
          question_id: qId,
          photo_urls: [p.url]
        }))
      );
      if (evidencesToInsert.length) await supabase.from('evidences').insert(evidencesToInsert);

      alert(
        `✅ ¡Carga exitosa!\n\n` +
        `Empresa: ${companyData.name}\n` +
        `RIF: ${companyData.rif}\n` +
        `Sector: ${companyData.sector}\n` +
        `Porcentaje de accesibilidad: ${getTotalStats().pct}%\n\n` +
        `Se ha generado el reporte.`
      );

      try {
        const reportBlob = await generateCompanyReportWord(company, true);
        if (reportBlob) {
          await sendCompanyReportEmail(company, reportBlob);
        }
      } catch (reportError) {
        console.error('Error generando reporte:', reportError);
      }

      localStorage.removeItem('omnitour_progress');
      localStorage.removeItem('progress_loaded');
      setView('results');
    } catch (error) {
      console.error(error);
      alert('Error al guardar: ' + error.message);
    }
  };

  const getCategoryDescription = (name, pct) => {
    if (name === 'Infraestructura y Entorno Físico') {
      if (pct === 0) return `El módulo "${name}" es nulo. No se evidencia accesibilidad.`;
      if (pct <= 33) return `El módulo "${name}" es crítico.`;
      if (pct <= 66) return `El módulo "${name}" tiene avances parciales.`;
      return `El módulo "${name}" presenta un nivel aceptable.`;
    }
    if (name === 'Conocimientos y Herramientas para la Atención') {
      if (pct === 0) return `El módulo "${name}" es nulo. Personal no formado.`;
      if (pct <= 33) return `El módulo "${name}" es muy bajo.`;
      if (pct <= 66) return `El módulo "${name}" tiene algunos avances.`;
      return `El módulo "${name}" es bueno.`;
    }
    if (name === 'Disponibilidad de Ayudas Técnicas') {
      if (pct === 0) return `El módulo "${name}" es nulo.`;
      if (pct <= 33) return `El módulo "${name}" es crítico.`;
      if (pct <= 66) return `El módulo "${name}" tiene ayudas parciales.`;
      return `El módulo "${name}" es adecuado.`;
    }
    if (name === 'Herramientas Tecnológicas de Apoyo') {
      if (pct === 0) return `El módulo "${name}" es nulo.`;
      if (pct <= 33) return `El módulo "${name}" es crítico.`;
      if (pct <= 66) return `El módulo "${name}" tiene avances incipientes.`;
      return `El módulo "${name}" es destacable.`;
    }
    if (name === 'Gestión de Emergencias') {
      if (pct === 0) return `El módulo "${name}" es nulo.`;
      if (pct <= 33) return `El módulo "${name}" es deficiente.`;
      if (pct <= 66) return `El módulo "${name}" tiene medidas básicas.`;
      return `El módulo "${name}" es adecuado.`;
    }
    return `Módulo evaluado con ${pct}% de cumplimiento.`;
  };

  const generateCompanyReportWord = async (company, returnBlob = false) => {
    try {
      const { data: respuestas } = await supabase.from('answers').select('*').eq('company_id', company.id);
      if (!respuestas || respuestas.length === 0) {
        alert('⚠️ Esta empresa no ha completado el registro.');
        return;
      }
      const respuestasMap = {};
      respuestas.forEach(r => respuestasMap[r.question_id] = r.score);

      const { data: evidenciasData } = await supabase.from('evidences').select('*').eq('company_id', company.id);

      const moduleScores = puntajesPorModulo(company.sector, respuestasMap)
        .map(m => ({ ...m, description: getCategoryDescription(m.name, m.pct) }));
      const totalPct = promedioDeModulos(moduleScores);
      const nivel = nivelDeAccesibilidad(totalPct);
      const trofeoBuffer = await fetchImagenValidada(nivel.trofeo);
      const header = await membreteOmniIaet();

      const sections = [];

      sections.push(
        new Paragraph({ children: [new TextRun({ text: 'Informe de Accesibilidad Turística', bold: true, size: 26 })], alignment: AlignmentType.CENTER, spacing: { after: 200 } }),
        new Paragraph({ children: [new TextRun({ text: `Nombre de la Empresa: ${company.name}`, bold: true, size: 22 })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun(`RIF: ${company.rif} | RTN: ${company.rtn || 'N/A'} | Sector: ${company.sector}`)], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun(`Dirección: ${company.address || 'No registrada'} | Teléfono: ${company.phone || 'No registrado'} | Email: ${company.email || 'No registrado'}`)], alignment: AlignmentType.CENTER, spacing: { after: 300 } })
      );

      sections.push(
        new Paragraph({ children: [new TextRun({ text: 'La empresa turística se encuentra en el nivel de', bold: true, size: 22 })], alignment: AlignmentType.CENTER }),
        new Paragraph({ children: [new TextRun({ text: nivel.texto, bold: true, color: "4F46E5", size: 28 })], alignment: AlignmentType.CENTER }),
        trofeoBuffer ? new Paragraph({ children: [imagenEnReporte(trofeoBuffer, 120)], alignment: AlignmentType.CENTER, spacing: { after: 300 } }) : new Paragraph({ text: '', spacing: { after: 300 } })
      );

      sections.push(new Paragraph({ children: [new TextRun({ text: 'Resultados por categoría', bold: true, size: 22 })], spacing: { after: 200 } }));

      for (let i = 0; i < moduleScores.length; i++) {
        const m = moduleScores[i];
        const canvas = document.createElement('canvas');
        canvas.width = 200; canvas.height = 200;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, 200, 200);
        const angulo = (m.pct / 100) * 2 * Math.PI;
        const start = -Math.PI / 2;
        const end = start + angulo;
        ctx.beginPath(); ctx.moveTo(100, 100); ctx.arc(100, 100, 80, 0, 2 * Math.PI); ctx.fillStyle = '#e2e8f0'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(100, 100); ctx.arc(100, 100, 80, start, end); ctx.fillStyle = '#4f46e5'; ctx.fill();
        ctx.font = 'bold 18px Arial'; ctx.fillStyle = '#1e293b'; ctx.fillText(`${m.pct}%`, 100, 115);
        const imgBuffer = await dataURLToArrayBuffer(canvas.toDataURL());
        sections.push(
          new Paragraph({ children: [imagenEnReporte(imgBuffer, 150)], alignment: AlignmentType.CENTER, spacing: { after: 50 } }),
          new Paragraph({ children: [new TextRun({ text: `${m.name}: ${m.pct}%`, bold: true, size: 18 })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
          new Paragraph({ children: [new TextRun(m.description)], spacing: { after: 200 } })
        );
      }

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
        new Paragraph({ children: [imagenEnReporte(generalImgBuffer, 150)], alignment: AlignmentType.CENTER, spacing: { after: 50 } }),
        new Paragraph({ children: [new TextRun({ text: `${totalPct}%`, bold: true, size: 24 })], alignment: AlignmentType.CENTER, spacing: { after: 100 } }),
        new Paragraph({ children: [new TextRun(totalPct >= 85 ? 'Excelente nivel global.' : totalPct >= 70 ? 'Buen nivel, atender áreas identificadas.' : totalPct >= 50 ? 'Nivel básico, plan de mejora urgente.' : 'Nivel crítico, intervención inmediata.')], alignment: AlignmentType.CENTER, spacing: { after: 400 } })
      );

      // Mismo desglose que ven el admin y el portal: sale de las respuestas ya
      // cargadas, así el informe no puede decir otra cosa que la pantalla.
      const gruposDiscapacidad = calcularPorcentajesPorDiscapacidad(company.sector, respuestasMap);
      const cobertura = coberturaAuditoria(company.sector, respuestasMap);
      const logosDiscapacidad = await Promise.all(
        gruposDiscapacidad.map(g => (g.logo ? fetchImagenValidada(g.logo) : Promise.resolve(null)))
      );

      const celda = (children, ancho) => new TableCell({
        children,
        width: { size: ancho, type: WidthType.PERCENTAGE },
        verticalAlign: VerticalAlign.CENTER
      });
      const textoCelda = (texto, opts = {}) => new Paragraph({
        children: [new TextRun({ text: texto, size: 18, ...opts })],
        alignment: AlignmentType.CENTER
      });

      sections.push(
        new Paragraph({ children: [new TextRun({ text: 'Accesibilidad por tipo de discapacidad', bold: true, size: 22 })], spacing: { before: 200, after: 100 } }),
        new Paragraph({ children: [new TextRun({ text: 'Una misma pregunta puede contar en más de un tipo, por eso estos porcentajes no suman 100% entre sí.', italics: true, size: 16, color: '64748B' })], spacing: { after: 200 } }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: [
                celda([textoCelda('Tipo de discapacidad', { bold: true })], 46),
                celda([textoCelda('Porcentaje', { bold: true })], 22),
                celda([textoCelda('Preguntas evaluadas', { bold: true })], 32)
              ]
            }),
            ...gruposDiscapacidad.map((g, i) => new TableRow({
              children: [
                celda([new Paragraph({
                  children: [
                    ...(logosDiscapacidad[i] ? [imagenEnReporte(logosDiscapacidad[i], 20), new TextRun('  ')] : []),
                    new TextRun({ text: g.label, bold: true, size: 18 })
                  ]
                })], 46),
                celda([textoCelda(g.pct === null ? '—' : `${g.pct}%`, { bold: true })], 22),
                celda([textoCelda(g.n === 0 ? 'no aplica en este sector' : `${g.respondidas} de ${g.n}`)], 32)
              ]
            }))
          ]
        })
      );

      if (cobertura.respondidas > 0 && cobertura.respondidas < cobertura.total) {
        sections.push(new Paragraph({
          children: [new TextRun({ text: `Evaluadas ${cobertura.respondidas} de ${cobertura.total} preguntas del sector: los porcentajes cubren solo lo auditado.`, italics: true, size: 18, color: 'B45309' })],
          spacing: { before: 100, after: 300 }
        }));
      } else {
        sections.push(new Paragraph({ text: '', spacing: { after: 300 } }));
      }

      sections.push(new Paragraph({ children: [new TextRun({ text: 'Recomendaciones generales', bold: true, size: 20 })], spacing: { after: 200 } }));
      const recs = [];
      recs.push('Recibir formación y capacitación en turismo accesible contactar con el IAET.');

      if (totalPct >= 85) {
        recs.push('Mantener y mejorar aspectos menores identificados en el informe.');
        recs.push('Realizar auditorías periódicas para asegurar la continuidad de la accesibilidad.');
      } else if (totalPct >= 60) {
        recs.push('Priorizar mejoras en accesos, sanitarios y comunicación visual.');
        recs.push('Capacitar al personal en atención a personas con discapacidad.');
        recs.push('Implementar ayudas técnicas básicas (rampas, señalética, bucles magnéticos).');
      } else if (totalPct >= 40) {
        recs.push('Realizar una auditoría externa especializada en accesibilidad.');
        recs.push('Crear un comité de accesibilidad con personas con discapacidad.');
        recs.push('Elaborar un plan de mejora a corto y mediano plazo.');
        recs.push('Priorizar la adecuación de sanitarios y accesos.');
      } else {
        recs.push('Plan de mejora integral con intervención inmediata en todos los módulos.');
        recs.push('Contratar un asesor en accesibilidad universal.');
        recs.push('Realizar un diagnóstico detallado de cada área.');
        recs.push('Establecer un cronograma de acciones correctivas.');
      }

      recs.forEach(rec => sections.push(new Paragraph({ children: [new TextRun(`• ${rec}`)], bullet: { level: 0 }, spacing: { after: 100 } })));
      sections.push(new Paragraph({ text: '', spacing: { after: 400 } }));

      if (evidenciasData && evidenciasData.length > 0) {
        sections.push(new Paragraph({ children: [new TextRun({ text: 'Evidencias fotográficas', bold: true, size: 20 })], spacing: { after: 200 } }));
        for (const ev of evidenciasData) {
          const questionText = getQuestionText(ev.question_id);
          const photoUrl = ev.photo_urls?.[0] || '';
          // ev.ai_analysis se ignora a propósito: la columna sigue existiendo y las
          // filas guardadas antes de este cambio contienen texto generado al azar.
          sections.push(new Paragraph({ children: [new TextRun(`Pregunta asociada: ${questionText}`)], spacing: { after: 100 } }));
          if (photoUrl) {
            try {
              const imgBuffer = await fetchImagenValidada(photoUrl);
              if (imgBuffer) {
                sections.push(new Paragraph({ children: [imagenEnReporte(imgBuffer, 300)], alignment: AlignmentType.CENTER, spacing: { after: 400 } }));
              } else {
                sections.push(new Paragraph({ children: [new TextRun('[No se pudo cargar la imagen]')], spacing: { after: 400 } }));
              }
            } catch (err) { sections.push(new Paragraph({ children: [new TextRun('[No se pudo cargar la imagen]')], spacing: { after: 400 } })); }
          }
        }
      } else {
        sections.push(new Paragraph({ children: [new TextRun('No se cargaron evidencias fotográficas durante el registro.')], spacing: { after: 200 } }));
      }

      sections.push(new Paragraph({ text: '', spacing: { after: 400 } }));
      sections.push(new Paragraph({ children: [new TextRun({ text: 'Dr. Juan E. Luján A.', bold: true })], alignment: AlignmentType.CENTER }));
      sections.push(new Paragraph({ children: [new TextRun('Validador de Accesibilidad Turística')], alignment: AlignmentType.CENTER }));

      const doc = documentoConMembrete(sections, header);

      const blob = await Packer.toBlob(doc);
      if (returnBlob) {
        return blob;
      } else {
        saveAs(blob, `reporte_${company.rif}.docx`);
      }
    } catch (error) {
      console.error('Error generando reporte Word:', error);
      alert('Error al generar el reporte: ' + error.message);
    }
  };

  // Documento aparte del informe: acredita el nivel obtenido y nada más. Solo se
  // emite desde Bronce hacia arriba; a una empresa Normal o Inaccesible se le
  // explica por qué no hay certificado en vez de darle un documento que no la
  // acredita.
  // Va en PDF y no en Word: es un documento para entregar e imprimir, y Word
  // invitaría a editarlo. El informe técnico sigue siendo .docx a propósito.
  const generarCertificadoPdf = async (company) => {
    try {
      const { data: respuestas } = await supabase.from('answers').select('*').eq('company_id', company.id);
      if (!respuestas || respuestas.length === 0) {
        alert('⚠️ Esta empresa no ha completado el registro.');
        return;
      }
      const respuestasMap = {};
      respuestas.forEach(r => respuestasMap[r.question_id] = r.score);

      // Mismo criterio del informe: promedio de los porcentajes por módulo. Si el
      // certificado mostrara total_percentage (puntos sobre el máximo) podría
      // decir un número distinto al nivel que acredita en el mismo documento.
      const totalPct = promedioDeModulos(puntajesPorModulo(company.sector, respuestasMap));
      const nivel = nivelDeAccesibilidad(totalPct);

      if (!nivel.certificable) {
        alert(`⚠️ ${company.name} está en nivel ${nivel.texto} con ${Math.round(totalPct)}%.\n\nEl certificado se emite desde el nivel BRONCE (60%) en adelante.`);
        return;
      }

      const emision = new Date();
      const vencimiento = new Date(emision);
      vencimiento.setFullYear(vencimiento.getFullYear() + 1);

      const [omni, iaet, trofeo, fuenteBase64] = await Promise.all([
        cargarAssetPdf('/Logo-OmniTours.png').then(a => redimensionarParaPdf(a, 500, 'jpeg')),
        cargarAssetPdf('/iaet-logo.png').then(a => redimensionarParaPdf(a, 620, 'png')),
        cargarAssetPdf(nivel.trofeo).then(a => redimensionarParaPdf(a, 560, 'jpeg')),
        fetch(fuenteCaligrafia).then(r => r.arrayBuffer()).then(buf => aBase64(new Uint8Array(buf)))
      ]);

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      doc.addFileToVFS('GreatVibes-Regular.ttf', fuenteBase64);
      doc.addFont('GreatVibes-Regular.ttf', 'GreatVibes', 'normal');
      dibujarCertificado(doc, {
        nombre: company.name,
        rif: company.rif,
        sector: (sectors.find(s => s.id === company.sector) || {}).label || company.sector,
        nivelTexto: nivel.texto,
        pct: Math.round(totalPct),
        emision: fechaLarga(emision),
        vencimiento: fechaLarga(vencimiento),
        firmante: 'Dr. Juan E. Luján A.',
        cargo: 'Validador de Accesibilidad Turística',
        imagenes: { omni, iaet, trofeo }
      });
      doc.save(`certificado_${company.rif}.pdf`);
    } catch (error) {
      console.error('Error generando certificado PDF:', error);
      alert('Error al generar el certificado: ' + error.message);
    }
  };

  const increaseFontSize = () => setFontSizeMultiplier(prev => Math.min(prev + 0.1, 2));
  const decreaseFontSize = () => setFontSizeMultiplier(prev => Math.max(prev - 0.1, 0.8));
  const cycleContrastMode = () => {
    const modes = ['normal-contrast', 'high-contrast', 'yellow-on-black'];
    const currentIndex = modes.indexOf(contrastMode);
    setContrastMode(modes[(currentIndex + 1) % modes.length]);
  };

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div role="status" className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 font-bold">Cargando...</p>
        </div>
      </div>
    );
  }

  if (showDisabilityPortal) {
    return (
      <DisabilityPortal
        onBack={async () => {
          setShowDisabilityPortal(false);
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const { data } = await supabase
              .from('disability_users')
              .select('id')
              .eq('user_id', session.user.id)
              .maybeSingle();
            if (data) {
              setShowDisabilityPortal(true);
            } else {
              setSession(session);
              setUser(session.user);
              await obtenerRol(session.user.id);
            }
          }
        }}
      />
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full">
          <img
            src="/logo-omnitours-vertical.png"
            alt="Omnitours"
            className="w-32 sm:w-36 md:w-40 lg:w-48 mx-auto mb-6 h-auto"
          />
          <h1 className="text-2xl font-black text-center mb-2">OmniTour</h1>
          <p className="text-center text-slate-500 text-sm mb-6">Inicia sesión para continuar</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="text-xs font-black uppercase text-slate-600">Email</label>
              <input
                id="login-email"
                type="email"
                className="w-full border rounded-xl px-4 py-3 mt-1 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label htmlFor="login-password" className="text-xs font-black uppercase text-slate-600">Contraseña</label>
              <input
                id="login-password"
                type="password"
                className="w-full border rounded-xl px-4 py-3 mt-1 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>
            <button
              type="submit"
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-black hover:bg-indigo-700 active:scale-95 transition-all"
              disabled={loading}
            >
              {loading ? 'Cargando...' : 'Iniciar sesión'}
            </button>
          </form>

          <div className="mt-6 border-t pt-6">
            <p className="text-center text-slate-500 text-xs font-bold mb-3">
              ¿Eres una persona con discapacidad?
            </p>
            <button
              onClick={() => setShowDisabilityPortal(true)}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-black hover:bg-purple-700 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              ♿ Acceder al Portal de Discapacidad
            </button>
          </div>

          <div className="mt-6 text-center text-xs text-slate-500">
            <p>¿No tienes cuenta? Contacta al administrador.</p>
          </div>
        </div>
      </div>
    );
  }

  const textSizeStyle = { fontSize: `${fontSizeMultiplier * 1}rem` };
  const contrastClasses = contrastMode === 'high-contrast' ? 'bg-black text-white' :
                         contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300' : '';

  return (
    <div className={`flex flex-col h-screen font-sans relative ${contrastClasses}`} style={textSizeStyle}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:bg-white focus:text-indigo-700 focus:px-4 focus:py-2 focus:rounded-xl focus:font-black focus:shadow-lg"
      >
        Saltar al contenido principal
      </a>
      <img
        src="/iaet-logo.png"
        alt="IAET"
        className="fixed bottom-4 right-4 opacity-15 pointer-events-none z-50 w-10 sm:w-14 md:w-20 lg:w-24"
      />

      {uploadMessage.show && (
        <div className={`fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-full shadow-lg text-white text-sm font-bold ${uploadMessage.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
          {uploadMessage.text}
        </div>
      )}

      <header className={`bg-white/90 backdrop-blur-md p-4 shadow-sm flex justify-between items-center sticky top-0 z-50 border-b ${contrastMode === 'high-contrast' ? 'bg-black border-white' : ''} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300' : ''}`}>
        <div className="flex items-center gap-3">
          <img
            src="/logo-omnitours-horizontal.png"
            alt="Omnitours"
            className="h-9 sm:h-12 md:h-14 lg:h-16 xl:h-20 w-auto"
          />
          <div className="text-xs">
            <span className={`font-black ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-800'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{user.email}</span>
            <span className={`ml-2 px-2 py-0.5 rounded-full text-[8px] font-black ${userRole === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'} ${contrastMode === 'high-contrast' ? (userRole === 'admin' ? 'bg-yellow-300 text-black' : 'bg-white text-black') : ''} ${contrastMode === 'yellow-on-black' ? (userRole === 'admin' ? 'bg-yellow-300 text-black' : 'bg-white text-black') : ''}`}>
              {userRole === 'admin' ? 'ADMIN' : 'USUARIO'}
            </span>
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <button onClick={increaseFontSize} aria-label="Aumentar tamaño del texto" className={`p-1 rounded-full hover:bg-slate-200 active:bg-teal-500 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><Type size={18} aria-hidden="true" /></button>
          <button onClick={decreaseFontSize} aria-label="Reducir tamaño del texto" className={`p-1 rounded-full hover:bg-slate-200 active:bg-teal-500 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><Type size={18} aria-hidden="true" /></button>
          <button onClick={cycleContrastMode} aria-label="Cambiar modo de contraste" className={`p-1 rounded-full hover:bg-slate-200 active:bg-teal-500 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><Contrast size={18} aria-hidden="true" /></button>

          {userRole === 'admin' && (
            <button onClick={() => { setView('adminDashboard'); cargarEmpresas(); cargarUsuarios(); }} className={`text-indigo-600 text-xs flex items-center gap-1 active:bg-teal-500 px-2 py-1 rounded-lg bg-indigo-50 ${contrastMode === 'high-contrast' ? 'bg-black text-yellow-300 border border-yellow-300' : ''} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border border-yellow-300' : ''}`}>
              <LayoutDashboard size={16} /> Panel Admin
            </button>
          )}

          {deferredPrompt && (
            <button onClick={handleInstall} className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-black active:bg-teal-500">
              📲 Instalar App
            </button>
          )}
          <a href="/OmniTour.apk" download className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-black active:bg-teal-500 hover:bg-green-700 transition-colors">
            📲 Descargar App
          </a>
          <button onClick={handleLogout} className={`text-red-500 text-xs flex items-center gap-1 active:bg-teal-500 px-2 py-1 rounded-lg ${contrastMode === 'high-contrast' ? 'text-red-400' : ''} ${contrastMode === 'yellow-on-black' ? 'text-red-400' : ''}`}>
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      <main id="main-content" tabIndex={-1} ref={mainRef} className={`flex-1 overflow-y-auto p-4 pb-32 ${contrastClasses}`}>
        {/* ========== HOME ========== */}
        {view === 'home' && (
          <div className="max-w-4xl mx-auto space-y-8 pt-4">
            <div className="text-center space-y-4">
              <h1 className={`text-4xl font-black italic uppercase bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>
                Sistema de Registro<br/>Omnitours "Turismo para todos"
              </h1>
              <p className={`text-lg max-w-2xl mx-auto ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>
                Plataforma oficial de registro técnico y verificación de accesibilidad universal.
              </p>
              <div className="flex justify-center gap-4 flex-wrap">
                <button onClick={() => setView('registration')} className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all shadow-lg">
                  Registrar Empresa <ArrowRight size={20} />
                </button>
                <button onClick={() => setView('about')} className={`bg-white text-indigo-600 px-8 py-3 rounded-2xl font-black border-2 border-indigo-200 hover:bg-indigo-50 active:scale-95 transition-all ${contrastMode === 'high-contrast' ? 'bg-black text-yellow-300 border-yellow-300' : ''} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`}>
                  Conoce más <Info size={20} />
                </button>
                {userRole === 'admin' && (
                  <button onClick={() => { setView('adminDashboard'); cargarEmpresas(); cargarUsuarios(); }} className="bg-purple-600 text-white px-8 py-3 rounded-2xl font-black flex items-center gap-2 hover:bg-purple-700 active:scale-95 transition-all shadow-lg">
                    <Shield size={20} /> Panel Admin
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className={`p-4 rounded-2xl shadow text-center border ${contrastMode === 'high-contrast' ? 'bg-black border-white text-white' : 'bg-white border-slate-100'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300 text-yellow-300' : ''}`}>
                <Award className={`mx-auto mb-2 ${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`} size={32} />
                <h4 className="font-black text-sm">Certificación</h4>
                <p className={`text-xs ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Sello de calidad accesible</p>
              </div>
              <div className={`p-4 rounded-2xl shadow text-center border ${contrastMode === 'high-contrast' ? 'bg-black border-white text-white' : 'bg-white border-slate-100'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300 text-yellow-300' : ''}`}>
                <Users className={`mx-auto mb-2 ${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`} size={32} />
                <h4 className="font-black text-sm">Inclusión</h4>
                <p className={`text-xs ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Turismo para todos</p>
              </div>
              <div className={`p-4 rounded-2xl shadow text-center border ${contrastMode === 'high-contrast' ? 'bg-black border-white text-white' : 'bg-white border-slate-100'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300 text-yellow-300' : ''}`}>
                <TrendingUp className={`mx-auto mb-2 ${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`} size={32} />
                <h4 className="font-black text-sm">Mejora Continua</h4>
                <p className={`text-xs ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Diagnóstico y asesoría</p>
              </div>
              <div className={`p-4 rounded-2xl shadow text-center border ${contrastMode === 'high-contrast' ? 'bg-black border-white text-white' : 'bg-white border-slate-100'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300 text-yellow-300' : ''}`}>
                <Globe className={`mx-auto mb-2 ${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`} size={32} />
                <h4 className="font-black text-sm">Visibilidad</h4>
                <p className={`text-xs ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Registro nacional</p>
              </div>
            </div>

            {/* ✅ CONTADOR DE VISITAS LOCAL */}
            <div className={`p-4 rounded-2xl shadow border text-center ${contrastMode === 'high-contrast' ? 'bg-black border-white' : 'bg-white border-slate-100'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300' : ''}`}>
              <p className={`text-xs font-bold ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>
                👁️ Has visitado OmniTour <span className={`font-black ${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'}`}>{visitCount}</span> {visitCount === 1 ? 'vez' : 'veces'}
              </p>
            </div>

            <div className={`p-6 rounded-3xl shadow border text-center ${contrastMode === 'high-contrast' ? 'bg-black border-white' : 'bg-white border-slate-100'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300' : ''}`}>
              <h3 className={`text-sm font-black uppercase tracking-widest mb-4 ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Aliados y apoyo</h3>
              <div className="flex justify-center items-center gap-8 flex-wrap">
                <img src="/iaet-logo.png" alt="IAET" className="h-12 w-auto opacity-70" />
                <img src="/logo-omnitours-horizontal.png" alt="Omnitours" className="h-12 w-auto opacity-70" />
                <div className={`text-xs font-bold ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Instituto de Altos Estudios Transdisciplinarios</div>
              </div>
            </div>

            <div className={`text-center text-xs ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>
              <p>App desarrollada por el <span className="font-bold">IAET</span></p>
              <p className="mt-1">Versión 3.0 - Evaluación por sectores</p>
            </div>
          </div>
        )}

        {/* ========== ABOUT ========== */}
        {view === 'about' && (
          <div className="max-w-3xl mx-auto space-y-6">
            <button onClick={() => setView('home')} className={`flex items-center gap-1 text-sm font-black mb-4 ${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>
              <ArrowRight className="rotate-180" size={16} /> Volver
            </button>
            <div className={`p-8 rounded-3xl shadow border ${contrastMode === 'high-contrast' ? 'bg-black border-white text-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300 text-yellow-300' : ''}`}>
              <h2 className="text-2xl font-black mb-4">Acerca de OmniTour</h2>
              <div className="space-y-4">
                <p><strong>OmniTour</strong> es una plataforma digital que permite a las empresas turísticas venezolanas evaluar y mejorar su nivel de accesibilidad universal.</p>
                <p>El sistema se basa en un <strong>Baremo de Accesibilidad Turística</strong> que mide aspectos como infraestructura, atención al cliente, ayudas técnicas y gestión de emergencias.</p>
                <h4 className="font-black mt-4">¿Qué obtiene al registrarse?</h4>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Diagnóstico detallado de su nivel de accesibilidad</li>
                  <li>Reporte ejecutivo en formato Word con recomendaciones</li>
                  <li>Certificación según nivel alcanzado (Oro, Plata, Bronce)</li>
                  <li>Visibilidad en el registro nacional de turismo accesible</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ========== REGISTRO ========== */}
        {view === 'registration' && (
          <div className="max-w-md mx-auto space-y-6">
            <div className={`p-6 rounded-3xl shadow border ${contrastMode === 'high-contrast' ? 'bg-black border-white text-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300 text-yellow-300' : ''}`}>
              <h2 className="text-xl font-black mb-6 flex items-center justify-center gap-2"><Building2 size={24} className={`${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`} /> Datos del Prestador</h2>
              <div className="space-y-4">
                <div><label htmlFor="reg-nombre" className="text-[10px] font-black uppercase block text-center">Nombre Comercial *</label><input id="reg-nombre" className={`w-full border rounded-xl px-4 py-3 text-center ${registrationErrors.name ? 'border-red-500' : 'border-slate-200'} ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={companyData.name} onChange={e => setCompanyData({...companyData, name: e.target.value})} />{registrationErrors.name && <p className="text-red-500 text-xs text-center mt-1 flex items-center justify-center gap-1"><AlertTriangle size={12} /> {registrationErrors.name}</p>}</div>
                <div><label htmlFor="reg-rif" className="text-[10px] font-black uppercase block text-center">RIF *</label><input id="reg-rif" className={`w-full border rounded-xl px-4 py-3 text-center uppercase ${registrationErrors.rif ? 'border-red-500' : 'border-slate-200'} ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={companyData.rif} onChange={e => setCompanyData({...companyData, rif: e.target.value})} />{registrationErrors.rif && <p className="text-red-500 text-xs text-center mt-1 flex items-center justify-center gap-1"><AlertTriangle size={12} /> {registrationErrors.rif}</p>}</div>
                <div><label htmlFor="reg-rtn" className="text-[10px] font-black uppercase block text-center">RTN (opcional)</label><input id="reg-rtn" className={`w-full border rounded-xl px-4 py-3 text-center ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={companyData.rtn} onChange={e => setCompanyData({...companyData, rtn: e.target.value})} /></div>
                <div><label htmlFor="reg-telefono" className="text-[10px] font-black uppercase block text-center">Teléfono</label><input id="reg-telefono" type="tel" className={`w-full border rounded-xl px-4 py-3 text-center ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={companyData.phone} onChange={e => setCompanyData({...companyData, phone: e.target.value})} /></div>
                <div><label htmlFor="reg-email" className="text-[10px] font-black uppercase block text-center">Correo electrónico</label><input id="reg-email" type="email" className={`w-full border rounded-xl px-4 py-3 text-center ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={companyData.email} onChange={e => setCompanyData({...companyData, email: e.target.value})} /></div>
                <div><label htmlFor="reg-estado" className="text-[10px] font-black uppercase block text-center">Estado *</label><select id="reg-estado" className={`w-full border rounded-xl px-4 py-3 text-center ${registrationErrors.state ? 'border-red-500' : 'border-slate-200'} ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={companyData.state} onChange={e => setCompanyData({...companyData, state: e.target.value, city: ''})}><option value="">Seleccione</option>{venezuelaStates.map(s => <option key={s}>{s}</option>)}</select>{registrationErrors.state && <p className="text-red-500 text-xs text-center mt-1 flex items-center justify-center gap-1"><AlertTriangle size={12} /> {registrationErrors.state}</p>}</div>
                <div><label htmlFor="reg-municipio" className="text-[10px] font-black uppercase block text-center">Municipio *</label><select id="reg-municipio" className={`w-full border rounded-xl px-4 py-3 text-center ${registrationErrors.city ? 'border-red-500' : 'border-slate-200'} ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={companyData.city} onChange={e => setCompanyData({...companyData, city: e.target.value})} disabled={!companyData.state}><option value="">Seleccione</option>{(municipalities[companyData.state] || []).map(c => <option key={c}>{c}</option>)}</select>{registrationErrors.city && <p className="text-red-500 text-xs text-center mt-1 flex items-center justify-center gap-1"><AlertTriangle size={12} /> {registrationErrors.city}</p>}</div>
                <div><label htmlFor="reg-direccion" className="text-[10px] font-black uppercase block text-center">Dirección exacta *</label><input id="reg-direccion" className={`w-full border rounded-xl px-4 py-3 text-center ${registrationErrors.address ? 'border-red-500' : 'border-slate-200'} ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={companyData.address} onChange={e => setCompanyData({...companyData, address: e.target.value})} placeholder="Calle, número, referencia" />{registrationErrors.address && <p className="text-red-500 text-xs text-center mt-1 flex items-center justify-center gap-1"><AlertTriangle size={12} /> {registrationErrors.address}</p>}</div>
                <div className={`rounded-2xl overflow-hidden border h-40 relative flex items-center justify-center ${contrastMode === 'high-contrast' ? 'bg-black border-white' : 'bg-slate-100'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300' : ''}`}><MapPin size={40} className={`${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`} /><span className={`absolute bottom-2 text-xs text-center px-2 ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Ubicación: {companyData.address}, {companyData.city}, {companyData.state}</span></div>
                <div><span id="sector-group-label" className="text-[10px] font-black uppercase block text-center">Sector * <span className="font-normal text-slate-600">(determina las preguntas)</span></span>
                  <div role="group" aria-labelledby="sector-group-label" className="grid grid-cols-2 gap-3">
                    {sectors.map(s => (
                      <button key={s.id} aria-pressed={companyData.sector === s.id} onClick={() => setCompanyData({...companyData, sector: s.id})} className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all duration-200 active:scale-95 ${companyData.sector === s.id ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg scale-[1.02]' : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50'} ${contrastMode === 'high-contrast' ? (companyData.sector === s.id ? 'bg-yellow-300 text-black border-yellow-300' : 'bg-black text-white border-white') : ''} ${contrastMode === 'yellow-on-black' ? (companyData.sector === s.id ? 'bg-yellow-300 text-black border-yellow-300' : 'bg-black text-yellow-300 border-yellow-300') : ''}`}>
                        {companyData.sector === s.id && <CheckCircle2 size={20} aria-hidden="true" className="absolute top-2 right-2 text-white" />}
                        {s.icon}
                        <span className="text-[10px] font-black uppercase">{s.label}</span>
                        <span className="text-[7px] opacity-70">{s.description}</span>
                      </button>
                    ))}
                  </div>
                  {registrationErrors.sector && <p className="text-red-500 text-xs text-center mt-1 flex items-center justify-center gap-1"><AlertTriangle size={12} /> {registrationErrors.sector}</p>}
                </div>
              </div>
            </div>
            <button onClick={() => { if (validateCompanyData()) { setRegistrationModules(getModulesBySector(companyData.sector)); setView('audit'); } }} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black active:bg-teal-500 flex items-center justify-center gap-2">Continuar Registro <ChevronRight size={20}/></button>
          </div>
        )}

        {/* ========== AUDIT ========== */}
        {view === 'audit' && (() => {
          const modules = getCurrentModules();
          const totalModules = modules.length;
          const progress = totalModules > 0 ? ((currentModule) / totalModules) * 100 : 0;
          return (
            <>
              {(() => { if (companyData.rif && !localStorage.getItem('progress_loaded')) { loadProgressLocally(); localStorage.setItem('progress_loaded', 'true'); } return null; })()}
              <div className="max-w-xl mx-auto space-y-4">
                <div className={`p-4 rounded-2xl shadow ${contrastMode === 'high-contrast' ? 'bg-black border border-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border border-yellow-300' : ''}`}>
                  <div className={`flex justify-between text-xs font-black mb-1 ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>
                    <span>Progreso</span>
                    <span>{currentModule + 1} de {totalModules} módulos</span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className="bg-indigo-600 h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                  </div>
                </div>

                <div className="bg-indigo-600 p-6 rounded-3xl text-white shadow-xl">
                  <span className="text-[10px] font-black">Módulo {currentModule+1}/{totalModules}</span>
                  <h2 className="text-xl font-black">{modules[currentModule]?.title}</h2>
                  <p className="text-sm">{modules[currentModule]?.description}</p>
                  {modules[currentModule]?.isSpecific && (
                    <span className="inline-block mt-1 bg-yellow-400 text-indigo-900 text-[8px] font-black px-2 py-0.5 rounded-full">Específico del sector</span>
                  )}
                </div>

                {modules[currentModule]?.questions.map(q => (
                  <div key={q.id} className={`rounded-3xl shadow border p-6 ${contrastMode === 'high-contrast' ? 'bg-black border-white text-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300 text-yellow-300' : ''}`}>
                    <div className="flex items-center justify-between gap-2 mb-4">
                      <span className={`text-[9px] font-black px-3 py-1 rounded-full ${contrastMode === 'high-contrast' ? 'bg-yellow-300 text-black' : 'bg-indigo-50 text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'bg-yellow-300 text-black' : ''}`}>{q.cat}</span>
                      <button className={`transition-colors ${contrastMode === 'high-contrast' ? 'text-white hover:text-yellow-300' : 'text-slate-600 hover:text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300 hover:text-white' : ''}`} aria-label={`Ayuda sobre la pregunta de ${q.cat}`} onClick={() => alert(`💡 Esta pregunta evalúa el aspecto "${q.cat}".`)}>
                        <HelpCircle size={16} aria-hidden="true" />
                      </button>
                    </div>
                    <p id={`pregunta-${q.id}`} className="text-base font-bold my-4 text-center">{q.text}</p>
                    <div role="group" aria-labelledby={`pregunta-${q.id}`} className="grid grid-cols-4 gap-2 mb-4">
                      {[...Array(q.max+1).keys()].map(i => (
                        <button key={i} aria-pressed={answers[q.id] === i} aria-label={`Puntuación ${i}`} onClick={() => handleAnswer(q.id, i)} className={`py-3 text-sm font-black rounded-xl border transition-all duration-150 flex items-center justify-center gap-1 ${answers[q.id] === i ? 'bg-emerald-600 border-emerald-600 text-white shadow-md scale-[1.02]' : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200 hover:border-slate-400'} ${contrastMode === 'high-contrast' ? (answers[q.id] === i ? 'bg-yellow-300 text-black border-yellow-300' : 'bg-black text-white border-white') : ''} ${contrastMode === 'yellow-on-black' ? (answers[q.id] === i ? 'bg-yellow-300 text-black border-yellow-300' : 'bg-black text-yellow-300 border-yellow-300') : ''}`}>
                          {answers[q.id] === i && <span className="text-base" aria-hidden="true">✓</span>}
                          {i}
                        </button>
                      ))}
                    </div>
                    <div className={`border-t pt-4 ${contrastMode === 'high-contrast' ? 'border-white' : ''} ${contrastMode === 'yellow-on-black' ? 'border-yellow-300' : ''}`}>
                      <p className="text-xs font-bold mb-2">Evidencias (máx 3):</p>
                      <div className="flex gap-2">
                        {[0,1,2].map(idx => (
                          <button key={idx} id={`btn-${q.id}-${idx}`} onClick={() => handlePhotoUpload(q.id, idx)} className={`px-3 py-1 rounded-lg text-xs font-black active:bg-teal-500 ${evidences[q.id]?.[idx] ? 'bg-green-100' : 'bg-slate-100'} ${contrastMode === 'high-contrast' ? (evidences[q.id]?.[idx] ? 'bg-yellow-300 text-black' : 'bg-black text-white border border-white') : ''} ${contrastMode === 'yellow-on-black' ? (evidences[q.id]?.[idx] ? 'bg-yellow-300 text-black' : 'bg-black text-yellow-300 border border-yellow-300') : ''}`}>
                            <Camera size={14}/> {evidences[q.id]?.[idx] ? 'Foto' : `Subir ${idx+1}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex gap-4 pt-4">
                  {currentModule > 0 && <button onClick={() => { setCurrentModule(m => m-1); saveProgressLocally(); }} className="flex-1 bg-white border py-4 rounded-2xl active:bg-teal-500">← Módulo anterior</button>}
                  {currentModule < totalModules - 1 ? (
                    <button onClick={() => { if (isCurrentModuleComplete()) { setCurrentModule(m => m+1); saveProgressLocally(); } }} className="flex-[2] bg-indigo-600 text-white py-4 rounded-2xl active:bg-teal-500">Siguiente módulo →</button>
                  ) : (
                    <button onClick={async () => {
                      if (isCurrentModuleComplete()) {
                        await saveRegistrationToSupabase();
                        setView('results');
                      }
                    }} className="flex-[2] bg-green-600 text-white py-4 rounded-2xl active:bg-teal-500">Finalizar</button>
                  )}
                </div>
              </div>
            </>
          );
        })()}

        {/* ========== RESULTADOS ========== */}
        {view === 'results' && (
          <div id="report-content" className="max-w-md mx-auto space-y-6 pb-32">
            <div className={`p-6 rounded-3xl shadow-xl text-center ${contrastMode === 'high-contrast' ? 'bg-black border border-white text-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border border-yellow-300 text-yellow-300' : ''}`}>
              <h2 className="text-2xl font-black">Resultados de Accesibilidad</h2>
              <p className={`${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{companyData.name}</p>
              <div className="mt-6 space-y-4 text-left">
                {getCurrentModules().map(mod => { const st = getModuleScore(mod.id); return st.max > 0 && (
                  <div key={mod.id}>
                    <div className="flex justify-between text-sm font-bold"><span>{mod.title}</span><span>{st.pct}%</span></div>
                    <div className="w-full bg-slate-200 rounded-full h-4"><div className="bg-indigo-600 h-4 rounded-full" style={{ width: `${st.pct}%` }}></div></div>
                  </div>
                ); })}
                <div className="pt-4 border-t mt-4">
                  <div className="flex justify-between text-lg font-black"><span>Promedio General</span><span>{getTotalStats().pct}%</span></div>
                  <div className="w-full bg-slate-200 rounded-full h-6 mt-2"><div className={`h-6 rounded-full ${getTotalStats().pct >= 50 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${getTotalStats().pct}%` }}></div></div>
                </div>
                <div className="flex justify-center mt-4"><img src={getAchievementImage(getTotalStats().pct)} className="w-40 h-auto rounded-lg shadow" alt="Logro" /></div>
              </div>
            </div>
          </div>
        )}

        {/* ========== ADMIN DASHBOARD ========== */}
        {view === 'adminDashboard' && userRole === 'admin' && (
          <div className="max-w-7xl mx-auto space-y-8">
            <div className="flex justify-between items-center flex-wrap gap-4">
              <h2 className={`text-2xl font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Panel de Administrador</h2>
              <div className="flex gap-2">
                <button onClick={() => setView('home')} className={`px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500 ${contrastMode === 'high-contrast' ? 'bg-black text-white border border-white' : 'bg-slate-200'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border border-yellow-300' : ''}`}>← Volver</button>
                <button onClick={handleLogout} className={`px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500 ${contrastMode === 'high-contrast' ? 'bg-black text-red-400 border border-red-400' : 'bg-red-100 text-red-700'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-red-400 border border-red-400' : ''}`}>Cerrar sesión</button>
              </div>
            </div>

            <div className={`rounded-2xl shadow p-6 ${contrastMode === 'high-contrast' ? 'bg-black border border-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border border-yellow-300' : ''}`}>
              <div className="flex justify-between items-center mb-4">
                <h3 className={`text-xl font-black flex items-center gap-2 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><Users size={24} className={`${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}/> Gestión de Usuarios</h3>
                <button onClick={() => setAuthView(authView === 'login' ? 'register' : 'login')} className={`text-sm font-black ${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>
                  {authView === 'login' ? '➕ Crear nuevo usuario' : '← Volver a lista'}
                </button>
              </div>

              {authView === 'register' && (
                <form onSubmit={handleRegisterUser} className={`p-4 rounded-xl mb-4 ${contrastMode === 'high-contrast' ? 'bg-black border border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black border border-yellow-300' : ''}`}>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input type="email" aria-label="Email del usuario" placeholder="Email del usuario" className={`border rounded-xl px-4 py-2 ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : ''} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} required />
                    <input type="password" aria-label="Contraseña" placeholder="Contraseña" className={`border rounded-xl px-4 py-2 ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : ''} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} required />
                    <select aria-label="Rol del usuario" className={`border rounded-xl px-4 py-2 ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : ''} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={newUserRole} onChange={e => setNewUserRole(e.target.value)}>
                      <option value="user">Usuario</option>
                      <option value="admin">Administrador</option>
                    </select>
                    <button type="submit" className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black active:bg-teal-500" disabled={loading}>
                      {loading ? 'Creando...' : 'Crear Usuario'}
                    </button>
                  </div>
                </form>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className={`${contrastMode === 'high-contrast' ? 'bg-black' : 'bg-gray-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black' : ''}`}>
                    <tr>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black uppercase ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Email</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black uppercase ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Rol</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black uppercase ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Fecha</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black uppercase ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Acciones</th>
                    </tr>
                  </thead>
                  <tbody className={`${contrastMode === 'high-contrast' ? 'bg-black divide-white' : 'bg-white divide-gray-200'} ${contrastMode === 'yellow-on-black' ? 'bg-black divide-yellow-300' : ''}`}>
                    {allUsers.map(u => (
                      <tr key={u.id} className={`${contrastMode === 'high-contrast' ? 'hover:bg-gray-800' : 'hover:bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'hover:bg-gray-800' : ''}`}>
                        <td className={`px-4 py-3 text-sm ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{u.email}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-black ${u.role === 'admin' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-600'} ${contrastMode === 'high-contrast' ? (u.role === 'admin' ? 'bg-yellow-300 text-black' : 'bg-white text-black') : ''} ${contrastMode === 'yellow-on-black' ? (u.role === 'admin' ? 'bg-yellow-300 text-black' : 'bg-white text-black') : ''}`}>
                            {u.role === 'admin' ? 'ADMIN' : 'USUARIO'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-sm ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 flex gap-2 flex-wrap">
                          {u.role === 'admin' ? (
                            <button onClick={() => cambiarRolUsuario(u.id, 'user')} className={`text-xs px-2 py-1 rounded-lg ${contrastMode === 'high-contrast' ? 'bg-yellow-300 text-black' : 'bg-yellow-100 text-yellow-700'} ${contrastMode === 'yellow-on-black' ? 'bg-yellow-300 text-black' : ''}`}>Degradar</button>
                          ) : (
                            <button onClick={() => cambiarRolUsuario(u.id, 'admin')} className={`text-xs px-2 py-1 rounded-lg ${contrastMode === 'high-contrast' ? 'bg-yellow-300 text-black' : 'bg-indigo-100 text-indigo-700'} ${contrastMode === 'yellow-on-black' ? 'bg-yellow-300 text-black' : ''}`}>Promover</button>
                          )}
                          <button onClick={() => enviarResetPassword(u.email)} className={`text-xs px-2 py-1 rounded-lg ${contrastMode === 'high-contrast' ? 'bg-blue-300 text-black' : 'bg-blue-100 text-blue-700'} ${contrastMode === 'yellow-on-black' ? 'bg-blue-300 text-black' : ''}`}>Restablecer</button>
                          <button onClick={() => eliminarUsuario(u.id)} className={`text-xs px-2 py-1 rounded-lg ${contrastMode === 'high-contrast' ? 'bg-red-300 text-black' : 'bg-red-100 text-red-700'} ${contrastMode === 'yellow-on-black' ? 'bg-red-300 text-black' : ''}`}>Eliminar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`rounded-2xl shadow p-6 ${contrastMode === 'high-contrast' ? 'bg-black border border-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border border-yellow-300' : ''}`}>
              <h3 className={`text-xl font-black mb-4 flex items-center gap-2 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><BarChart size={24} className={`${contrastMode === 'high-contrast' ? 'text-yellow-300' : 'text-indigo-600'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}/> Resumen por estado</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className={`${contrastMode === 'high-contrast' ? 'bg-black' : 'bg-gray-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black' : ''}`}>
                    <tr>
                      <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Estado</th>
                      <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Empresas</th>
                      <th scope="col" className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Promedio accesibilidad</th>
                    </tr>
                  </thead>
                  <tbody className={`${contrastMode === 'high-contrast' ? 'bg-black divide-white' : 'bg-white divide-gray-200'} ${contrastMode === 'yellow-on-black' ? 'bg-black divide-yellow-300' : ''}`}>
                    {statsByState.map((stat, idx) => (
                      <tr key={idx} className={`${contrastMode === 'high-contrast' ? 'hover:bg-gray-800' : 'hover:bg-gray-50'} ${contrastMode === 'yellow-on-black' ? 'hover:bg-gray-800' : ''} cursor-pointer`} onClick={() => filtrarPorEstado(stat.estado)}>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-900'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{stat.estado}</td>
                        <td className={`px-6 py-4 whitespace-nowrap text-sm ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{stat.cantidad}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-gray-200 rounded-full h-2">
                              <div className={`h-2 rounded-full ${getPctColor(stat.promedio)}`} style={{ width: `${stat.promedio}%` }}></div>
                            </div>
                            <span className={`text-sm font-bold ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{stat.promedio}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className={`p-6 rounded-2xl shadow ${contrastMode === 'high-contrast' ? 'bg-black border border-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border border-yellow-300' : ''}`}>
              <h3 className={`text-lg font-black mb-4 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Buscar empresa por RIF</h3>
              <div className="flex flex-col sm:flex-row gap-3">
                <input type="text" aria-label="Ingrese RIF" placeholder="Ingrese RIF" className={`flex-1 border rounded-xl px-4 py-3 text-center uppercase ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : ''} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`} value={searchRif} onChange={(e) => setSearchRif(e.target.value.toUpperCase())} />
                <button onClick={buscarEmpresaPorRif} disabled={loadingSearch} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black active:bg-teal-500 disabled:opacity-50">
                  {loadingSearch ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
              {searchResult && (
                <div className={`mt-4 p-4 border rounded-xl ${contrastMode === 'high-contrast' ? 'bg-black border-white' : 'bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300' : ''}`}>
                  {searchResult.found ? (
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <div><p className={`font-bold ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{searchResult.empresa.name}</p><p className={`text-xs ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>RIF: {searchResult.empresa.rif} | Score: {searchResult.empresa.total_percentage}%</p></div>
                      <div className="flex gap-2">
                        <button onClick={() => generateCompanyReportWord(searchResult.empresa)} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500">📄 Reporte Word</button>
                        <button onClick={() => generarCertificadoPdf(searchResult.empresa)} className="bg-amber-600 text-white px-4 py-2 rounded-xl text-sm font-black active:bg-teal-500">🏅 Certificado PDF</button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-red-500 font-bold">❌ No encontrada</p>
                  )}
                </div>
              )}
            </div>

            <div className={`rounded-2xl shadow p-6 ${contrastMode === 'high-contrast' ? 'bg-black border border-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black border border-yellow-300' : ''}`}>
              <div className="flex justify-between items-center mb-6 flex-wrap gap-4">
                <h3 className={`text-lg font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Empresas Registradas</h3>
                <div className="flex gap-3">
                  <select aria-label="Filtrar empresas por estado" value={selectedState} onChange={(e) => filtrarPorEstado(e.target.value)} className={`border rounded-xl px-4 py-2 text-sm font-black ${contrastMode === 'high-contrast' ? 'bg-black text-white border-white' : 'bg-white'} ${contrastMode === 'yellow-on-black' ? 'bg-black text-yellow-300 border-yellow-300' : ''}`}>
                    <option value="">Todos los estados</option>
                    {venezuelaStates.map(state => (<option key={state} value={state}>{state}</option>))}
                  </select>
                  <button onClick={exportToExcel} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-black flex items-center gap-2 active:bg-teal-500"><Download size={16}/> Excel</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className={`${contrastMode === 'high-contrast' ? 'bg-black' : 'bg-gray-50'} ${contrastMode === 'yellow-on-black' ? 'bg-black' : ''}`}>
                    <tr>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>#</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Empresa</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>RIF</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Sector</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Estado</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Score</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Por discapacidad</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Usuario</th>
                      <th scope="col" className={`px-4 py-3 text-left text-xs font-black ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>Acción</th>
                    </tr>
                  </thead>
                  <tbody className={`${contrastMode === 'high-contrast' ? 'bg-black divide-white' : 'bg-white divide-gray-200'} ${contrastMode === 'yellow-on-black' ? 'bg-black divide-yellow-300' : ''}`}>
                    {filteredCompanies.length === 0 ? (<tr><td colSpan="9" className={`text-center py-8 ${contrastMode === 'high-contrast' ? 'text-white' : 'text-gray-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>No hay empresas</td></tr>) : filteredCompanies.map((emp, idx) => (
                      <tr key={emp.id} className={`${contrastMode === 'high-contrast' ? 'hover:bg-gray-800' : 'hover:bg-slate-50'} ${contrastMode === 'yellow-on-black' ? 'hover:bg-gray-800' : ''}`}>
                        <td className={`px-4 py-3 text-sm font-bold ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{idx+1}</td>
                        <td className={`px-4 py-3 text-sm ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{emp.name}</td>
                        <td className={`px-4 py-3 text-sm ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{emp.rif}</td>
                        <td className={`px-4 py-3 text-sm ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{emp.sector}</td>
                        <td className={`px-4 py-3 text-sm ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{emp.address ? emp.address.split(',').pop()?.trim() : 'N/A'}</td>
                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-black text-white ${getPctColor(emp.total_percentage || 0)}`}>{emp.total_percentage || 0}%</span></td>
                        <td className="px-4 py-3 min-w-[230px]">
                          <FichasPorDiscapacidad
                            grupos={calcularPorcentajesPorDiscapacidad(emp.sector, respuestasPorEmpresa[emp.id])}
                            empresa={emp.name}
                            cobertura={coberturaAuditoria(emp.sector, respuestasPorEmpresa[emp.id])}
                          />
                        </td>
                        <td className={`px-4 py-3 text-xs ${contrastMode === 'high-contrast' ? 'text-white' : 'text-slate-500'} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}>{emp.user_id || 'Desconocido'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            <button onClick={() => generateCompanyReportWord(emp)} aria-label={`Descargar reporte de ${emp.name}`} title="Informe de accesibilidad" className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-xs font-black"><span aria-hidden="true">📄</span></button>
                            <button onClick={() => generarCertificadoPdf(emp)} aria-label={`Descargar certificado en PDF de ${emp.name}`} title="Certificado en PDF por nivel obtenido (solo Oro, Plata y Bronce)" className="bg-amber-600 text-white px-3 py-1 rounded-lg text-xs font-black"><span aria-hidden="true">🏅</span></button>
                            <button onClick={(e) => abrirEdicionEmpresa(emp, e.currentTarget)} aria-label={`Modificar registro de ${emp.name}`} title="Modificar datos y respuestas de la auditoría" className="bg-slate-600 text-white px-3 py-1 rounded-lg text-xs font-black"><span aria-hidden="true">✏️</span></button>
                            <button onClick={(e) => abrirBorradoEmpresa(emp, e.currentTarget)} aria-label={`Eliminar registro de ${emp.name}`} title="Eliminar empresa" className="bg-red-600 text-white px-3 py-1 rounded-lg text-xs font-black"><span aria-hidden="true">🗑️</span></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {(view === 'home' || view === 'registration' || view === 'audit' || view === 'results' || view === 'about') && (
        <nav className={`bg-white/90 backdrop-blur-xl border-t fixed bottom-0 w-full flex justify-around items-center h-24 px-8 pb-6 shadow-lg z-50 ${contrastMode === 'high-contrast' ? 'bg-black border-white' : ''} ${contrastMode === 'yellow-on-black' ? 'bg-black border-yellow-300' : ''}`}>
          <button onClick={() => setView('home')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><LayoutDashboard size={24} /><span className="text-[9px] font-black">Inicio</span></button>
          <button onClick={() => setView('registration')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><ClipboardList size={24} /><span className="text-[9px] font-black">Registrar</span></button>
          {userRole === 'admin' && (
            <button onClick={() => { setView('adminDashboard'); cargarEmpresas(); cargarUsuarios(); }} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><Shield size={24} /><span className="text-[9px] font-black">Admin</span></button>
          )}
          <button onClick={() => setView('about')} className={`flex flex-col items-center gap-1.5 active:bg-teal-500 active:rounded-full active:p-1 ${contrastMode === 'high-contrast' ? 'text-white' : ''} ${contrastMode === 'yellow-on-black' ? 'text-yellow-300' : ''}`}><Info size={24} /><span className="text-[9px] font-black">Acerca de</span></button>
        </nav>
      )}

      {userRole === 'admin' && empresaEnEdicion && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-3 sm:p-6">
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="titulo-edicion-empresa" tabIndex={-1}
            className={`w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-3xl shadow-2xl outline-none ${fondoModal}`}>

            <div className={`sticky top-0 z-10 flex items-start justify-between gap-4 p-6 border-b ${contrastMode === 'normal-contrast' ? 'bg-white border-slate-200' : 'border-current'}`}>
              <div>
                <h2 id="titulo-edicion-empresa" className="text-lg font-black flex items-center gap-2"><Edit size={18} aria-hidden="true" /> Modificar registro</h2>
                <p className="text-xs font-bold mt-1 opacity-80">{empresaEnEdicion.name} · RIF {empresaEnEdicion.rif} · Sector: {empresaEnEdicion.sector}</p>
              </div>
              <button onClick={cerrarEdicionEmpresa} disabled={guardandoEdicion} className="shrink-0 px-4 py-2 rounded-xl text-xs font-black border border-current disabled:opacity-40 active:bg-teal-500">Cerrar</button>
            </div>

            <div className="p-6 space-y-6">
              <section aria-labelledby="edicion-datos-titulo">
                <h3 id="edicion-datos-titulo" className="text-sm font-black uppercase mb-3">Datos de la empresa</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div><label htmlFor="ed-nombre" className="text-[10px] font-black uppercase block mb-1">Nombre comercial *</label><input id="ed-nombre" className={`w-full border rounded-xl px-4 py-3 text-center ${campoModal}`} value={edicionDatos.name || ''} onChange={e => setEdicionDatos({ ...edicionDatos, name: e.target.value })} /></div>
                  <div><label htmlFor="ed-rif" className="text-[10px] font-black uppercase block mb-1">RIF *</label><input id="ed-rif" className={`w-full border rounded-xl px-4 py-3 text-center uppercase ${campoModal}`} value={edicionDatos.rif || ''} onChange={e => setEdicionDatos({ ...edicionDatos, rif: e.target.value.toUpperCase() })} /></div>
                  <div><label htmlFor="ed-rtn" className="text-[10px] font-black uppercase block mb-1">RTN (opcional)</label><input id="ed-rtn" className={`w-full border rounded-xl px-4 py-3 text-center ${campoModal}`} value={edicionDatos.rtn || ''} onChange={e => setEdicionDatos({ ...edicionDatos, rtn: e.target.value })} /></div>
                  <div><label htmlFor="ed-telefono" className="text-[10px] font-black uppercase block mb-1">Teléfono</label><input id="ed-telefono" type="tel" className={`w-full border rounded-xl px-4 py-3 text-center ${campoModal}`} value={edicionDatos.phone || ''} onChange={e => setEdicionDatos({ ...edicionDatos, phone: e.target.value })} /></div>
                  <div className="sm:col-span-2"><label htmlFor="ed-email" className="text-[10px] font-black uppercase block mb-1">Correo electrónico</label><input id="ed-email" type="email" className={`w-full border rounded-xl px-4 py-3 text-center ${campoModal}`} value={edicionDatos.email || ''} onChange={e => setEdicionDatos({ ...edicionDatos, email: e.target.value })} /></div>
                  <div><label htmlFor="ed-estado" className="text-[10px] font-black uppercase block mb-1">Estado *</label>
                    <select id="ed-estado" className={`w-full border rounded-xl px-4 py-3 text-center ${campoModal}`} value={edicionDatos.state || ''} onChange={e => setEdicionDatos({ ...edicionDatos, state: e.target.value, city: '' })}>
                      <option value="">Seleccione</option>
                      {venezuelaStates.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><label htmlFor="ed-municipio" className="text-[10px] font-black uppercase block mb-1">Municipio *</label>
                    <select id="ed-municipio" className={`w-full border rounded-xl px-4 py-3 text-center ${campoModal}`} value={edicionDatos.city || ''} disabled={!edicionDatos.state} onChange={e => setEdicionDatos({ ...edicionDatos, city: e.target.value })}>
                      <option value="">Seleccione</option>
                      {(municipalities[edicionDatos.state] || []).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-2"><label htmlFor="ed-direccion" className="text-[10px] font-black uppercase block mb-1">Dirección exacta *</label><input id="ed-direccion" className={`w-full border rounded-xl px-4 py-3 text-center ${campoModal}`} placeholder="Calle, número, referencia" value={edicionDatos.address || ''} onChange={e => setEdicionDatos({ ...edicionDatos, address: e.target.value })} /></div>
                </div>
                <p className="text-xs font-bold mt-3 opacity-70">El sector no se cambia desde aquí: define qué preguntas tiene la auditoría, y cambiarlo dejaría huérfanas las respuestas ya guardadas.</p>
              </section>

              <section aria-labelledby="edicion-respuestas-titulo">
                <h3 id="edicion-respuestas-titulo" className="text-sm font-black uppercase mb-3">Respuestas de la auditoría</h3>
                {cargandoEdicion ? (
                  <p role="status" className="text-sm font-bold">Cargando respuestas guardadas…</p>
                ) : modulosEdicion.length === 0 ? (
                  <p className="text-sm font-bold flex items-center gap-2"><AlertTriangle size={16} aria-hidden="true" /> Este sector no tiene preguntas cargadas en el catálogo.</p>
                ) : modulosEdicion.map(mod => (
                  <fieldset key={mod.id} className={`rounded-2xl border p-4 mb-4 ${contrastMode === 'normal-contrast' ? 'border-slate-200' : 'border-current'}`}>
                    <legend className="text-xs font-black px-2 uppercase">{mod.title}</legend>
                    <p className="text-[10px] font-bold mb-3 opacity-70">{mod.description}</p>
                    {mod.questions.map(q => {
                      const actual = edicionRespuestas[q.id];
                      const tocada = respuestasOriginales[q.id] !== actual;
                      return (
                        <div key={q.id} className={`flex flex-col sm:flex-row sm:items-center gap-2 py-2.5 border-b last:border-b-0 ${contrastMode === 'normal-contrast' ? 'border-slate-100' : 'border-current'}`}>
                          <label htmlFor={`ed-resp-${q.id}`} className="text-xs font-bold flex-1">{q.text}</label>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${contrastMode === 'high-contrast' ? 'bg-yellow-300 text-black' : contrastMode === 'yellow-on-black' ? 'bg-yellow-300 text-black' : 'bg-indigo-50 text-indigo-600'}`}>{q.cat}</span>
                            <select id={`ed-resp-${q.id}`} className={`border rounded-lg px-3 py-2 text-xs font-black ${campoModal}`}
                              value={typeof actual === 'number' ? actual : ''}
                              onChange={e => {
                                const raw = e.target.value;
                                setEdicionRespuestas(prev => {
                                  const next = { ...prev };
                                  if (raw === '') delete next[q.id];
                                  else next[q.id] = Number(raw);
                                  return next;
                                });
                              }}>
                              <option value="">Sin responder</option>
                              {[...Array(q.max + 1).keys()].map(i => <option key={i} value={i}>{i}</option>)}
                            </select>
                            {tocada && <span className="text-[9px] font-black text-amber-600">modificada</span>}
                          </div>
                        </div>
                      );
                    })}
                  </fieldset>
                ))}
              </section>
            </div>

            <div aria-live="polite" className={`mx-6 mb-4 rounded-2xl border p-4 text-sm font-bold ${contrastMode === 'normal-contrast' ? 'border-slate-200 bg-slate-50' : 'border-current'}`}>
              <p>Puntaje: {totalesEdicion.score} de {totalesEdicion.max} ({totalesEdicion.pct}%) · {nivelEdicion.texto}</p>
              <p className="text-xs mt-1 opacity-80">{respuestasCambias === 0 ? 'Sin cambios en las respuestas.' : `${respuestasCambias} respuesta(s) modificada(s).`}</p>
            </div>

            <div className={`sticky bottom-0 flex flex-col sm:flex-row gap-3 p-6 border-t ${contrastMode === 'normal-contrast' ? 'bg-white border-slate-200' : 'border-current'}`}>
              <button onClick={cerrarEdicionEmpresa} disabled={guardandoEdicion} className="flex-1 px-6 py-3 rounded-xl text-sm font-black border border-current disabled:opacity-40 active:bg-teal-500">Cancelar</button>
              <button onClick={guardarEdicionEmpresa} disabled={cargandoEdicion || guardandoEdicion} className="flex-1 px-6 py-3 rounded-xl text-sm font-black text-white bg-emerald-600 disabled:opacity-40 active:bg-teal-500">
                {guardandoEdicion ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {userRole === 'admin' && empresaABorrar && (
        <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4">
          <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="titulo-borrado-empresa" tabIndex={-1}
            className={`w-full max-w-lg rounded-3xl shadow-2xl outline-none ${fondoModal}`}>
            <div className="p-6">
              <h2 id="titulo-borrado-empresa" className="text-lg font-black flex items-center gap-2 text-red-500"><AlertTriangle size={20} aria-hidden="true" /> Eliminar empresa</h2>
              <p className="text-sm font-bold mt-4">Va a borrar el registro de <strong>{empresaABorrar.name}</strong> (RIF {empresaABorrar.rif}).</p>
              <ul className="text-xs font-bold mt-3 space-y-1.5 list-disc pl-5 opacity-80">
                <li>Se elimina únicamente la fila de la empresa.</li>
                <li>Sus respuestas y sus fotos de evidencia no se borran: quedan en la base de datos y en Storage.</li>
                <li>La cuenta de usuario vinculada sigue existiendo.</li>
              </ul>
              <label htmlFor="borrado-rif" className="text-[10px] font-black uppercase block mt-5">Escriba el RIF para confirmar *</label>
              <input id="borrado-rif" autoComplete="off" aria-describedby="borrado-rif-ayuda" className={`w-full border rounded-xl px-4 py-3 text-center uppercase mt-1 ${campoModal}`} value={rifConfirmacion} onChange={e => setRifConfirmacion(e.target.value.toUpperCase())} />
              <p id="borrado-rif-ayuda" className="text-xs font-bold mt-2 opacity-70">Debe coincidir exactamente con {empresaABorrar.rif}.</p>
              {!rifConfirmado && rifConfirmacion.trim() !== '' && <p role="status" className="text-xs font-black text-red-500 mt-2">El RIF escrito no coincide.</p>}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 p-6 pt-0">
              <button onClick={cerrarBorradoEmpresa} disabled={borrando} className="flex-1 px-6 py-3 rounded-xl text-sm font-black border border-current disabled:opacity-40 active:bg-teal-500">Cancelar</button>
              <button onClick={confirmarBorradoEmpresa} disabled={!rifConfirmado || borrando} className="flex-1 px-6 py-3 rounded-xl text-sm font-black text-white bg-red-600 disabled:opacity-40 active:bg-teal-500 flex items-center justify-center gap-2">
                {borrando ? 'Eliminando…' : <><Trash2 size={16} aria-hidden="true" /> Eliminar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;