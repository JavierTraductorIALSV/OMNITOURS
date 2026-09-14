import React, { useState, useEffect } from 'react';
import { supabase, IS_PASSWORD_RECOVERY } from '../supabaseClient';
import { MapPin, Star, CheckCircle, LogOut, ArrowRight, Award } from 'lucide-react';

const DisabilityPortal = ({ onBack }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState(IS_PASSWORD_RECOVERY ? 'reset' : 'loading');
  const [recommendations, setRecommendations] = useState([]);
  const [filteredRecommendations, setFilteredRecommendations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetData, setResetData] = useState({ password: '', confirmPassword: '' });
  const [formData, setFormData] = useState({
    firstName: '', lastName: '', email: '', password: '',
    disabilityType: '', state: '', age: ''
  });

  const disabilityTypes = ['Visual', 'Auditiva', 'Motriz', 'Intelectual', 'Psicosocial', 'Múltiple', 'Otra'];

  const venezuelaStates = [
    'Amazonas', 'Anzoátegui', 'Apure', 'Aragua', 'Barinas', 'Bolívar', 'Carabobo',
    'Cojedes', 'Delta Amacuro', 'Distrito Capital', 'Falcón', 'Guárico', 'Lara',
    'Mérida', 'Miranda', 'Monagas', 'Nueva Esparta', 'Portuguesa', 'Sucre',
    'Táchira', 'Trujillo', 'La Guaira', 'Yaracuy', 'Zulia'
  ];

  const sectors = [
    { id: 'alojamiento', label: 'Alojamiento' },
    { id: 'restaurante', label: 'Restaurante' },
    { id: 'agencia', label: 'Agencia de Viaje' },
    { id: 'transporte', label: 'Transporte' },
    { id: 'museo', label: 'Museo / Patrimonio' },
    { id: 'aereo', label: 'Transporte Aéreo' },
    { id: 'recreacional', label: 'Recreacional' },
    { id: 'playa', label: 'Servicios de Playa' },
  ];

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        // La vista ya arrancó en 'reset'; no la pises con la sesión de recuperación
        if (IS_PASSWORD_RECOVERY) return;

        const { data: { session }, error } = await supabase.auth.getSession();
        if (!isMounted) return;
        if (error || !session) {
          setView('login');
          return;
        }

        const { data: profileRow } = await supabase
          .from('disability_users')
          .select('*')
          .eq('user_id', session.user.id)
          .maybeSingle();
        if (!isMounted) return;

        // La sesión activa es de empresa/admin, no de un usuario del portal
        if (!profileRow) {
          setView('login');
          return;
        }

        setUser(session.user);
        setProfile(profileRow);
        setView('recommendations');
      } catch (error) {
        console.error('Error iniciando el portal:', error);
        if (isMounted) setView('login');
      }
    };

    init();

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && isMounted) setView('reset');
    });

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (view === 'recommendations') loadRecommendations();
  }, [view]);

  useEffect(() => {
    applyFilters();
  }, [recommendations, searchTerm, selectedState, selectedSector]);

  // ============ CARGAR PERFIL DE DISCAPACIDAD ============
  const loadProfile = async (userId) => {
  try {
    const result = await Promise.race([
      supabase
        .from('disability_users')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('loadProfile timeout')), 2500)
      ),
    ]);

    const { data, error } = result;

    if (error) {
      console.error('Error al buscar perfil:', error.code, error.message);
      setErrorMsg(`Sesión iniciada, pero no se pudo leer tu perfil (${error.code || 'sin código'}): ${error.message}`);
      setView('register');
      return;
    }

    if (data) {
      setProfile(data);
      setView('recommendations');
    } else {
      console.warn('Sesión válida pero sin fila en disability_users para user_id:', userId);
      setErrorMsg('Sesión iniciada, pero tu perfil no está registrado en disability_users. Puede que la política RLS esté bloqueando la lectura o que el registro anterior no se haya guardado.');
      setView('register');
    }
  } catch (e) {
    console.warn('loadProfile timeout:', e.message);
    setErrorMsg('La consulta del perfil tardó más de 2.5s. Revisa tu conexión e intenta de nuevo.');
    setView('register');
  }
};
  // ============ CARGAR EMPRESAS ============
  const loadRecommendations = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .order('total_percentage', { ascending: false });
      if (error) throw error;
      setRecommendations(data || []);
    } catch (e) {
      console.error('Error al cargar empresas:', e);
    } finally {
      setLoading(false);
    }
  };

  // ============ FILTROS ============
  const applyFilters = () => {
    let filtered = [...recommendations];
    if (selectedState) {
      filtered = filtered.filter(c => c.address && c.address.includes(selectedState));
    }
    if (selectedSector) {
      filtered = filtered.filter(c => c.sector === selectedSector);
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      filtered = filtered.filter(c => c.name.toLowerCase().includes(t));
    }
    setFilteredRecommendations(filtered);
  };

  // ============ REGISTRO (SOLO disability_users) ============
  // ============ REGISTRO (con manejo de usuario ya existente) ============
  const handleRegister = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      // 1. Intentar crear el usuario en auth.users
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: { full_name: `${formData.firstName} ${formData.lastName}` }
        }
      });

      let userId = null;
      let hasSession = false;

      if (authError) {
        // Si el usuario ya existe, intentamos iniciar sesión
        if (authError.message.includes('already registered') || authError.status === 422) {
          console.log('⚠️ El correo ya existe. Intentando iniciar sesión...');
          const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email: formData.email,
            password: formData.password
          });
          if (signInError) {
            throw new Error('Este correo ya está registrado. Verifica tu contraseña o inicia sesión desde el botón "Ya tengo cuenta".');
          }
          userId = signInData.user.id;
          hasSession = true;
          setUser(signInData.user);
        } else {
          throw authError;
        }
      } else if (!authData.user || (authData.user.identities || []).length === 0) {
        // Con la protección anti-enumeración activada, Supabase responde 200 (sin error)
        // pero NO crea el usuario: devuelve identities vacío y session null.
        console.warn('signUp no creó el usuario. Respuesta:', authData);
        throw new Error('Este correo ya está registrado con otra contraseña. Inicia sesión desde "Ya tengo cuenta, iniciar sesión" o registra otro correo.');
      } else {
        userId = authData.user.id;
        hasSession = !!authData.session;
      }

      // 2. Verificar si ya tiene perfil en disability_users
      const { data: existingProfile } = await supabase
        .from('disability_users')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (!existingProfile) {
        // 3. Guardar SOLO en disability_users (NUNCA en profiles)
        // .select('id') confirma que la fila se creó: sin política RLS de INSERT,
        // PostgREST no devuelve error y descarta la fila en silencio.
        const { data: inserted, error: profileError } = await supabase
          .from('disability_users')
          .insert([{
            user_id: userId,
            email: formData.email,
            full_name: `${formData.firstName} ${formData.lastName}`.trim(),
            disability_type: formData.disabilityType,
            state: formData.state,
            age: parseInt(formData.age)
          }])
          .select('id');
        if (profileError) throw profileError;
        if (!inserted || inserted.length === 0) {
          throw new Error('El usuario se creó en auth, pero la fila en disability_users no se guardó. Falta una política RLS de INSERT (o de SELECT) sobre disability_users.');
        }
      }

      // 4. Si no hay sesión, iniciar sesión manual
      if (!hasSession) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password
        });
        if (signInError) throw signInError;
        setUser(signInData.user);
        await loadProfile(signInData.user.id);
      } else {
        await loadProfile(userId);
      }
    } catch (error) {
      console.error('Error al registrar:', error);
      setErrorMsg(error.message || 'Error al registrar.');
    } finally {
      setLoading(false);
    }
  };

  // ============ LOGIN ============
  const handleLogin = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginData.email,
        password: loginData.password,
      });
      if (error) throw error;

      setUser(data.user);
      await loadProfile(data.user.id);
    } catch (error) {
      console.error('Error en login:', error.code, error.message, error);
      const detail = error.message || 'Error desconocido';
      setErrorMsg(`No se pudo iniciar sesión (${error.code || 'sin código'}): ${detail}`);
    } finally {
      setLoading(false);
    }
  };

  // ============ OLVIDÉ MI CONTRASEÑA ============
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: window.location.origin,
      });
      if (error) throw error;
      setResetSent(true);
    } catch (error) {
      console.error('Error enviando enlace de recuperación:', error.code, error.message);
      setErrorMsg(`No se pudo enviar el enlace (${error.code || 'sin código'}): ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============ ESTABLECER NUEVA CONTRASEÑA ============
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (resetData.password !== resetData.confirmPassword) {
      setErrorMsg('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({ password: resetData.password });
      if (error) throw error;

      setUser(data.user);
      setResetData({ password: '', confirmPassword: '' });
      await loadProfile(data.user.id);
    } catch (error) {
      console.error('Error actualizando contraseña:', error.code, error.message);
      setErrorMsg(`No se pudo guardar la nueva contraseña (${error.code || 'sin código'}): ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // ============ LOGOUT ============
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error('Error al cerrar sesión:', e);
    }
    // Limpiar TODO el estado local
    setUser(null);
    setProfile(null);
    setRecommendations([]);
    setFilteredRecommendations([]);
    setSearchTerm('');
    setSelectedState('');
    setSelectedSector('');
    setLoginData({ email: '', password: '' });
    setResetEmail('');
    setResetSent(false);
    setResetData({ password: '', confirmPassword: '' });
    setFormData({
      firstName: '', lastName: '', email: '', password: '',
      disabilityType: '', state: '', age: ''
    });
    setErrorMsg('');
    setView('login');
    
    // Volver a la pantalla principal de la app (login de empresas/admin)
    if (onBack) onBack();
  };

  // ============ HELPERS ============
  const getStars = (pct) => Math.round((pct || 0) / 20);

  const getAchievementImage = (pct) => {
    if (pct >= 85) return '/Oro.png';
    if (pct >= 75) return '/plata.png';
    if (pct >= 60) return '/Bronce.png';
    if (pct >= 50) return '/Normal.png';
    return '/inaccesibilidad.png';
  };

  const getNivelTexto = (pct) => {
    if (pct >= 85) return 'ORO - Excelente';
    if (pct >= 75) return 'PLATA - Muy Bueno';
    if (pct >= 60) return 'BRONCE - Bueno';
    if (pct >= 50) return 'NORMAL - Básico';
    return 'INACCESIBLE - Crítico';
  };

  // ============ VISTA: CARGANDO ============
  if (view === 'loading') {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-purple-50 to-pink-50">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  // ============ VISTA: LOGIN ============
  if (view === 'login') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full">
          <img src="/Logo-Omnitours.png" alt="Omnitours" className="w-32 mx-auto mb-6 h-auto" />
          <h1 className="text-2xl font-black text-center mb-2 text-purple-700">Personas con Discapacidad</h1>
          <p className="text-center text-slate-500 text-sm mb-6">Inicia sesión para consultar lugares accesibles</p>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="email"
              placeholder="Correo Electrónico"
              required
              className="w-full border rounded-xl px-4 py-3"
              value={loginData.email}
              onChange={e => setLoginData({ ...loginData, email: e.target.value })}
            />
            <input
              type="password"
              placeholder="Contraseña"
              required
              className="w-full border rounded-xl px-4 py-3"
              value={loginData.password}
              onChange={e => setLoginData({ ...loginData, password: e.target.value })}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-black hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Ingresando...' : 'Iniciar Sesión'}
            </button>
          </form>

          <button
            onClick={() => { setView('forgot'); setErrorMsg(''); setResetSent(false); }}
            className="mt-3 w-full text-slate-500 text-xs font-black hover:text-purple-600"
          >
            ¿Olvidaste tu contraseña?
          </button>

          <div className="mt-6 text-center">
            <p className="text-slate-500 text-sm mb-2">¿No tienes cuenta?</p>
            <button
              onClick={() => { setView('register'); setErrorMsg(''); }}
              className="text-purple-600 font-black text-sm flex items-center gap-1 mx-auto"
            >
              Regístrate aquí <ArrowRight size={14} />
            </button>
          </div>

          <button
            onClick={() => onBack && onBack()}
            className="mt-6 w-full text-slate-400 text-xs font-black"
          >
            ← Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  // ============ VISTA: REGISTRO ============
  if (view === 'register') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full">
          <img src="/Logo-Omnitours.png" alt="Omnitours" className="w-32 mx-auto mb-6 h-auto" />
          <h1 className="text-2xl font-black text-center mb-2 text-purple-700">Crear Cuenta</h1>
          <p className="text-center text-slate-500 text-sm mb-6">Completa tus datos para acceder</p>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-3">
            <input
              type="text"
              placeholder="Nombre"
              required
              className="w-full border rounded-xl px-4 py-3"
              value={formData.firstName}
              onChange={e => setFormData({ ...formData, firstName: e.target.value })}
            />
            <input
              type="text"
              placeholder="Apellido"
              required
              className="w-full border rounded-xl px-4 py-3"
              value={formData.lastName}
              onChange={e => setFormData({ ...formData, lastName: e.target.value })}
            />
            <input
              type="email"
              placeholder="Correo Electrónico"
              required
              className="w-full border rounded-xl px-4 py-3"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
            <input
              type="password"
              placeholder="Contraseña (mínimo 6 caracteres)"
              required
              minLength={6}
              className="w-full border rounded-xl px-4 py-3"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
            <select
              required
              className="w-full border rounded-xl px-4 py-3"
              value={formData.disabilityType}
              onChange={e => setFormData({ ...formData, disabilityType: e.target.value })}
            >
              <option value="">Tipo de Discapacidad *</option>
              {disabilityTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              required
              className="w-full border rounded-xl px-4 py-3"
              value={formData.state}
              onChange={e => setFormData({ ...formData, state: e.target.value })}
            >
              <option value="">Estado donde vives *</option>
              {venezuelaStates.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              type="number"
              placeholder="Edad *"
              required
              min="1"
              max="120"
              className="w-full border rounded-xl px-4 py-3"
              value={formData.age}
              onChange={e => setFormData({ ...formData, age: e.target.value })}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-black hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Creando cuenta...' : 'Registrarme'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => { setView('login'); setErrorMsg(''); }}
              className="text-purple-600 font-black text-sm"
            >
              Ya tengo cuenta, iniciar sesión
            </button>
          </div>

          <button
            onClick={() => onBack && onBack()}
            className="mt-6 w-full text-slate-400 text-xs font-black"
          >
            ← Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  // ============ VISTA: OLVIDÉ MI CONTRASEÑA ============
  if (view === 'forgot') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full">
          <img src="/Logo-Omnitours.png" alt="Omnitours" className="w-32 mx-auto mb-6 h-auto" />
          <h1 className="text-2xl font-black text-center mb-2 text-purple-700">Recuperar acceso</h1>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4">
              {errorMsg}
            </div>
          )}

          {resetSent ? (
            <div className="text-center">
              <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-4 rounded-xl mb-6">
                Enviamos un enlace a <strong>{resetEmail}</strong>. Ábrelo desde este mismo
                navegador o dispositivo para establecer tu nueva contraseña.
              </div>
              <button
                onClick={() => { setResetSent(false); setResetEmail(''); }}
                className="w-full text-purple-600 text-xs font-black mb-3"
              >
                Enviar a otro correo
              </button>
            </div>
          ) : (
            <>
              <p className="text-center text-slate-500 text-sm mb-6">
                Te enviaremos un enlace para crear una contraseña nueva.
              </p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <input
                  type="email"
                  placeholder="Correo Electrónico"
                  required
                  className="w-full border rounded-xl px-4 py-3"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-purple-600 text-white py-3 rounded-xl font-black hover:bg-purple-700 disabled:opacity-50"
                >
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </form>
            </>
          )}

          <button
            onClick={() => { setView('login'); setErrorMsg(''); setResetSent(false); }}
            className="mt-6 w-full text-slate-400 text-xs font-black"
          >
            ← Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  // ============ VISTA: NUEVA CONTRASEÑA ============
  if (view === 'reset') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full">
          <img src="/Logo-Omnitours.png" alt="Omnitours" className="w-32 mx-auto mb-6 h-auto" />
          <h1 className="text-2xl font-black text-center mb-2 text-purple-700">Nueva contraseña</h1>
          <p className="text-center text-slate-500 text-sm mb-6">
            Escribe la contraseña que usarás de ahora en adelante.
          </p>

          {errorMsg && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl mb-4">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-4">
            <input
              type="password"
              placeholder="Nueva contraseña (mínimo 6 caracteres)"
              required
              minLength={6}
              className="w-full border rounded-xl px-4 py-3"
              value={resetData.password}
              onChange={e => setResetData({ ...resetData, password: e.target.value })}
            />
            <input
              type="password"
              placeholder="Repite la nueva contraseña"
              required
              minLength={6}
              className="w-full border rounded-xl px-4 py-3"
              value={resetData.confirmPassword}
              onChange={e => setResetData({ ...resetData, confirmPassword: e.target.value })}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 text-white py-3 rounded-xl font-black hover:bg-purple-700 disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>

          <button
            onClick={() => {
              setResetData({ password: '', confirmPassword: '' });
              setErrorMsg('');
              setView('login');
            }}
            className="mt-6 w-full text-slate-400 text-xs font-black"
          >
            ← Volver a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  // ============ VISTA: RECOMENDACIONES ============
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 pb-24">
      <header className="bg-white shadow-md sticky top-0 z-40 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-lg font-black text-purple-700">
              Hola, {profile?.full_name || user?.email?.split('@')[0]} 👋
            </h1>
            <p className="text-xs text-slate-500">
              {profile?.disability_type} · {profile?.state} · {profile?.age} años
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-red-500 text-xs flex items-center gap-1 font-black px-3 py-2 rounded-lg hover:bg-red-50"
          >
            <LogOut size={16} /> Salir
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4">
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white p-6 rounded-3xl mb-6 shadow-lg">
          <h2 className="text-2xl font-black mb-2">Consulta lugares accesibles</h2>
          <p className="text-sm opacity-90">
            Busca por sector y estado los lugares que se ajusten a tus necesidades.
          </p>
        </div>

        {/* Filtros */}
        <div className="bg-white p-4 rounded-2xl shadow mb-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="🔍 Buscar por nombre..."
            className="border rounded-xl px-4 py-2"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <select
            className="border rounded-xl px-4 py-2"
            value={selectedState}
            onChange={e => setSelectedState(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {venezuelaStates.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            className="border rounded-xl px-4 py-2"
            value={selectedSector}
            onChange={e => setSelectedSector(e.target.value)}
          >
            <option value="">Todos los sectores</option>
            {sectors.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        {/* Resultados */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-600 mx-auto"></div>
          </div>
        ) : filteredRecommendations.length === 0 ? (
          <div className="bg-white p-8 rounded-2xl text-center">
            <p className="text-slate-500">No se encontraron lugares con esos filtros.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRecommendations.map(company => {
              const stars = getStars(company.total_percentage);
              const nivelTexto = getNivelTexto(company.total_percentage);
              const sectorLabel = sectors.find(s => s.id === company.sector)?.label || company.sector;

              return (
                <div
                  key={company.id}
                  className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100 hover:shadow-2xl transition-shadow"
                >
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-black text-lg text-slate-800">
                          {company.name}
                        </h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                          <MapPin size={12} /> {company.address || 'Sin dirección'}
                        </p>
                      </div>
                      <img
                        src={getAchievementImage(company.total_percentage)}
                        alt="Nivel"
                        className="w-14 h-14 flex-shrink-0"
                      />
                    </div>

                    <div className="flex items-center gap-2 mb-3">
                      <span className="bg-indigo-100 text-indigo-700 text-xs font-black px-2 py-1 rounded-full">
                        {sectorLabel}
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-slate-600">
                          Nivel de accesibilidad
                        </span>
                        <span className="text-xs font-black text-purple-700">
                          {company.total_percentage || 0}%
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mb-2">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star
                            key={s}
                            size={18}
                            className={s <= stars ? 'text-yellow-400 fill-yellow-400' : 'text-slate-300'}
                          />
                        ))}
                        <span className="ml-2 text-xs font-black text-slate-700">
                          {stars}/5
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-700 text-center">
                        {nivelTexto}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 text-green-600 text-xs font-black mb-2">
                      <CheckCircle size={14} />
                      <span>Verificado por IAET</span>
                    </div>

                    {company.total_percentage >= 75 && (
                      <div className="bg-green-50 text-green-700 text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1">
                        <Award size={14} /> Altamente recomendado para ti
                      </div>
                    )}

                    {company.total_percentage < 50 && (
                      <div className="bg-red-50 text-red-700 text-xs font-bold px-3 py-2 rounded-xl">
                        ⚠️ Aún no cumple con los estándares mínimos
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default DisabilityPortal;