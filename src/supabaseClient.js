import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://alfynicevnplfbicouzb.supabase.co';
const supabaseAnonKey = 'sb_publishable_YWWft9FlaXff5WK9gRrrFA_6COoIwg4';

// Debe leerse antes de createClient: supabase-js borra el hash de la URL al procesar
// la sesión de recuperación, y después ningún componente alcanza a verlo.
// Se excluye /reset-password, que es la ruta del flujo de recuperación de empresas/admin
// en App.js; solo el enlace del portal de discapacidad redirige a la raíz.
export const IS_PASSWORD_RECOVERY =
  typeof window !== 'undefined' &&
  window.location.hash.includes('type=recovery') &&
  !window.location.pathname.startsWith('/reset-password');

// La recuperación de contraseña depende del flujo implícito (el default) y de
// detectSessionInUrl activo. No volver a configurar flowType: 'pkce' ni
// detectSessionInUrl: false aquí: con PKCE el enlace llega como ?code= en vez de
// por hash, y IS_PASSWORD_RECOVERY dejaría de detectarlo sin ningún error visible.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);