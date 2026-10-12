/**
 * Arnés de comportamiento (jsdom) para los modales de edición y borrado de
 * empresas del panel de administración. Monta el App REAL y lo ejercita contra
 * un cliente de Supabase simulado que registra cada llamada, para verificar el
 * guion completo: precarga, recálculo en vivo, trampa de foco, guarda de nombre
 * vacío, escrituras al guardar, y borrado condicionado al RIF que solo elimina
 * la fila de companies.
 *
 * Los números esperados salen del catálogo real de 'playa'
 * (getModulesBySector): m1-1 (6×2=12) + m2 (6×3=18) + m5 (1×2=2) +
 * PLA-ESP (8×2=16) = 48 puntos máximos.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { TextEncoder as NodeTextEncoder, TextDecoder as NodeTextDecoder } from 'util';

const act = React.act;

jest.mock('./supabaseClient', () => {
  const registros = {
    companies: [{
      id: 99,
      name: 'Hotel Prueba',
      rif: 'J-12345678-9',
      rtn: '',
      sector: 'playa',
      address: 'Calle 1, Baruta, Miranda',
      phone: '0212-1234567',
      email: 'x@y.z',
      total_score: 8,
      total_percentage: 25,
      user_id: 'u1',
      created_at: '2026-01-01'
    }],
    answers: [
      { company_id: 99, question_id: 'm1_1', score: 2 },
      { company_id: 99, question_id: 'm1_2', score: 1 },
      { company_id: 99, question_id: 'm2_1', score: 3 },
      { company_id: 99, question_id: 'm5_1', score: 2 }
    ],
    profiles: [{ id: 'u1', role: 'admin', email: 'admin@test', created_at: '2026-01-01' }]
  };
  const llamadas = [];
  global.__stub = { registros, llamadas };

  const cadena = (tabla, ops) => {
    const ejecutar = () => {
      llamadas.push({ tabla, ops: ops.map(o => ({ ...o })) });
      const single = ops.some(o => o.t === 'maybeSingle');
      const del = ops.find(o => o.t === 'delete');
      const ins = ops.find(o => o.t === 'insert');
      const upd = ops.find(o => o.t === 'update');

      let datos = registros[tabla] ? registros[tabla].slice() : [];
      ops.forEach(o => {
        if (o.t === 'eq') datos = datos.filter(r => String(r[o.c]) === String(o.v));
        if (o.t === 'in') datos = datos.filter(r => o.arr.map(String).includes(String(r[o.c])));
      });

      if (del) {
        registros[tabla] = (registros[tabla] || []).filter(r => !datos.includes(r));
        return Promise.resolve({ data: null, error: null });
      }
      if (ins) {
        registros[tabla] = (registros[tabla] || []).concat(ins.rows);
        return Promise.resolve({ data: ins.rows, error: null });
      }
      if (upd) {
        (registros[tabla] || []).forEach(r => { if (datos.includes(r)) Object.assign(r, upd.patch); });
        return Promise.resolve({ data: datos, error: null });
      }
      if (single) return Promise.resolve({ data: datos[0] || null, error: null });
      return Promise.resolve({ data: datos, error: null });
    };

    const self = {
      select: () => { ops.push({ t: 'select' }); return self; },
      eq: (c, v) => { ops.push({ t: 'eq', c, v }); return self; },
      in: (c, arr) => { ops.push({ t: 'in', c, arr }); return self; },
      order: (c, o) => { ops.push({ t: 'order', c, o }); return self; },
      delete: () => { ops.push({ t: 'delete' }); return self; },
      insert: (rows) => { ops.push({ t: 'insert', rows }); return self; },
      update: (patch) => { ops.push({ t: 'update', patch }); return self; },
      maybeSingle: () => { ops.push({ t: 'maybeSingle' }); return self; },
      then: (res, rej) => ejecutar().then(res, rej)
    };
    return self;
  };

  return {
    IS_PASSWORD_RECOVERY: false,
    supabase: {
      from: (tabla) => cadena(tabla, []),
      auth: {
        getSession: async () => ({
          data: { session: { user: { id: 'u1', email: 'admin@test' } } },
          error: null
        }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } })
      }
    }
  };
});

// jsdom no expone TextEncoder/TextDecoder, y la cadena de import de jspdf
// (iobuffer) los necesita en tiempo de carga. Se aplican antes de requerir App.
if (!global.TextEncoder) global.TextEncoder = NodeTextEncoder;
if (!global.TextDecoder) global.TextDecoder = NodeTextDecoder;

// Le dice a React 18 que este entorno sí maneja act(); sin esto cada update
// loguea "The current testing environment is not configured to support act(...)".
global.IS_REACT_ACT_ENVIRONMENT = true;

// require (no hoisted) para que el polyfill corra antes de evaluar el módulo App;
// el jest.mock de arriba sí está hoisted, así que App recibe el cliente simulado.
const App = require('./App').default;

jest.setTimeout(20000);

const SELECTOR_FOCALES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let container;
let root;

const flush = async () => {
  await act(async () => {
    for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0));
  });
};

const clic = async (el) => {
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  await flush();
};

const setValor = async (el, value) => {
  const proto = el.tagName === 'SELECT'
    ? window.HTMLSelectElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  await act(async () => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await flush();
};

const tecla = async (key, mods = {}) => {
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
  });
};

const porId = (id) => document.getElementById(id);
const modalEdicion = () => document.querySelector('[aria-labelledby="titulo-edicion-empresa"]');
const modalBorrado = () => document.querySelector('[aria-labelledby="titulo-borrado-empresa"]');
const botonAdmin = () => Array.from(document.querySelectorAll('button')).find(b => /Admin/.test(b.textContent));
const botonEditar = () => document.querySelector('button[aria-label="Modificar registro de Hotel Prueba"]');
const botonBorrar = () => document.querySelector('button[aria-label="Eliminar registro de Hotel Prueba"]');
const liveEdicion = () => modalEdicion().querySelector('[aria-live="polite"]').textContent;
const llamadas = () => global.__stub.llamadas;
const nEscrituras = () => llamadas().filter(l => l.ops.some(o => ['delete', 'insert', 'update'].includes(o.t))).length;
const unaLlamada = (tabla, tipo) => llamadas().find(l => l.tabla === tabla && l.ops.some(o => o.t === tipo));

const abrirEdicion = async () => {
  const boton = botonEditar();
  await clic(boton);
  return boton;
};

beforeAll(async () => {
  window.HTMLElement.prototype.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(React.createElement(App)); });
  await flush();
  await flush();
});

afterAll(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
  window.alert.mockRestore();
});

beforeEach(() => {
  window.alert.mockClear();
});

describe('Panel de administración: modales de empresas', () => {
  test('llega al panel y lista la empresa', async () => {
    await clic(botonAdmin());
    expect(botonEditar()).toBeTruthy();
    expect(botonBorrar()).toBeTruthy();
    expect(document.body.textContent).toContain('Hotel Prueba');
  });

  test('abre el modal de edición con los campos precargados', async () => {
    const disparador = await abrirEdicion();
    expect(modalEdicion()).toBeTruthy();

    expect(porId('ed-nombre').value).toBe('Hotel Prueba');
    expect(porId('ed-rif').value).toBe('J-12345678-9');
    expect(porId('ed-telefono').value).toBe('0212-1234567');
    expect(porId('ed-estado').value).toBe('Miranda');
    expect(porId('ed-municipio').value).toBe('Baruta');
    expect(porId('ed-direccion').value).toBe('Calle 1');

    expect(porId('ed-resp-m1_1').value).toBe('2');
    expect(porId('ed-resp-m1_2').value).toBe('1');
    expect(porId('ed-resp-m1_3').value).toBe('');

    expect(liveEdicion()).toContain('Puntaje: 8 de 48 (17%)');
    expect(liveEdicion()).toContain('Sin cambios en las respuestas.');

    // Escape cierra sin escribir y devuelve el foco al disparador.
    const antes = nEscrituras();
    await tecla('Escape');
    await flush();
    expect(modalEdicion()).toBeFalsy();
    expect(nEscrituras()).toBe(antes);
    expect(document.activeElement).toBe(disparador);
  });

  test('Tab y Shift+Tab ciclan dentro del modal (trampa de foco)', async () => {
    await abrirEdicion();
    const modal = modalEdicion();
    const focales = Array.from(modal.querySelectorAll(SELECTOR_FOCALES));
    expect(focales.length).toBeGreaterThan(1);
    const primero = focales[0];
    const ultimo = focales[focales.length - 1];

    await act(async () => { ultimo.focus(); });
    await tecla('Tab');
    expect(document.activeElement).toBe(primero);

    await tecla('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(ultimo);

    await tecla('Escape');
    await flush();
    expect(modalEdicion()).toBeFalsy();
  });

  test('recalcula puntaje y contador de cambios en vivo', async () => {
    await abrirEdicion();
    const modal = modalEdicion();

    // m1_2: 1 -> 2 (sube el puntaje, marca la fila como modificada)
    await setValor(porId('ed-resp-m1_2'), '2');
    expect(modal.textContent).toContain('modificada');
    expect(liveEdicion()).toContain('1 respuesta(s) modificada(s).');
    expect(liveEdicion()).toContain('Puntaje: 9 de 48 (19%)');

    // m5_1: 2 -> Sin responder (baja el puntaje, segunda modificación)
    await setValor(porId('ed-resp-m5_1'), '');
    expect(liveEdicion()).toContain('2 respuesta(s) modificada(s).');
    expect(liveEdicion()).toContain('Puntaje: 7 de 48 (15%)');

    // Se descarta con Escape: nada de esto debe escribirse todavía.
    const antes = nEscrituras();
    await tecla('Escape');
    await flush();
    expect(nEscrituras()).toBe(antes);
  });

  test('no guarda con el nombre vacío', async () => {
    await abrirEdicion();
    await setValor(porId('ed-nombre'), '');
    const antes = nEscrituras();

    const guardar = Array.from(modalEdicion().querySelectorAll('button'))
      .find(b => /Guardar cambios/.test(b.textContent));
    await clic(guardar);

    expect(window.alert).toHaveBeenCalledWith('El nombre de la empresa no puede quedar vacío.');
    expect(nEscrituras()).toBe(antes);
    expect(modalEdicion()).toBeTruthy(); // sigue abierto

    await tecla('Escape');
    await flush();
  });

  test('guardar borra e inserta respuestas y actualiza la empresa', async () => {
    await abrirEdicion();
    await setValor(porId('ed-resp-m1_2'), '2');
    await setValor(porId('ed-resp-m5_1'), '');

    const guardar = Array.from(modalEdicion().querySelectorAll('button'))
      .find(b => /Guardar cambios/.test(b.textContent));
    await clic(guardar);

    // Borrado de las dos preguntas tocadas.
    const delAns = unaLlamada('answers', 'delete');
    expect(delAns).toBeTruthy();
    const eqAns = delAns.ops.find(o => o.t === 'eq');
    expect(eqAns.c).toBe('company_id');
    expect(eqAns.v).toBe(99);
    const inAns = delAns.ops.find(o => o.t === 'in');
    expect(inAns.c).toBe('question_id');
    expect(inAns.arr).toEqual(['m1_2', 'm5_1']);

    // Reinserción solo de la que quedó con valor numérico.
    const insAns = unaLlamada('answers', 'insert');
    expect(insAns.ops.find(o => o.t === 'insert').rows)
      .toEqual([{ company_id: 99, question_id: 'm1_2', score: 2 }]);

    // Actualización de la fila de la empresa con los totales recalculados.
    const upd = unaLlamada('companies', 'update');
    const patch = upd.ops.find(o => o.t === 'update').patch;
    expect(patch.name).toBe('Hotel Prueba');
    expect(patch.rif).toBe('J-12345678-9');
    expect(patch.address).toBe('Calle 1, Baruta, Miranda');
    expect(patch.total_score).toBe(7);
    expect(patch.total_percentage).toBe(15);

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Respuestas modificadas: 2'));
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Puntaje: 7 de 48 (15%)'));
    expect(modalEdicion()).toBeFalsy();
  });

  test('al reabrir, los cambios persisten y el contador se reinicia', async () => {
    await abrirEdicion();
    expect(porId('ed-resp-m1_2').value).toBe('2');
    expect(porId('ed-resp-m5_1').value).toBe('');
    expect(liveEdicion()).toContain('Sin cambios en las respuestas.');
    expect(liveEdicion()).toContain('Puntaje: 7 de 48 (15%)');

    await tecla('Escape');
    await flush();
  });

  test('el borrado exige el RIF y solo elimina la fila de companies', async () => {
    const respuestasAntes = global.__stub.registros.answers.length;

    await clic(botonBorrar());
    const modal = modalBorrado();
    expect(modal).toBeTruthy();
    expect(modal.getAttribute('aria-labelledby')).toBe('titulo-borrado-empresa');

    const eliminar = Array.from(modal.querySelectorAll('button'))
      .find(b => /Eliminar/.test(b.textContent) && !/Eliminar empresa/.test(b.textContent));
    expect(eliminar.disabled).toBe(true);

    // RIF equivocado: aviso y botón sigue deshabilitado.
    await setValor(porId('borrado-rif'), 'J-0000000-0');
    expect(modal.textContent).toContain('El RIF escrito no coincide.');
    expect(eliminar.disabled).toBe(true);

    // RIF correcto (en minúsculas, se normaliza a mayúsculas).
    await setValor(porId('borrado-rif'), 'j-12345678-9');
    expect(modal.textContent).not.toContain('El RIF escrito no coincide.');
    expect(eliminar.disabled).toBe(false);

    await clic(eliminar);

    const delComp = unaLlamada('companies', 'delete');
    expect(delComp).toBeTruthy();
    const eqComp = delComp.ops.find(o => o.t === 'eq');
    expect(eqComp.c).toBe('id');
    expect(eqComp.v).toBe(99);

    // Las respuestas quedan huérfanas a propósito: no se borran.
    expect(global.__stub.registros.answers.length).toBe(respuestasAntes);
    expect(global.__stub.registros.companies.length).toBe(0);

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('no se borran'));
    expect(modalBorrado()).toBeFalsy();
    expect(document.body.textContent).toContain('No hay empresas');
  });
});
