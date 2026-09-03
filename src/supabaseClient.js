import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://alfynicevnplfbicouzb.supabase.co'; // 👈 URL CORRECTA (termina en "b")
const supabaseAnonKey = 'sb_publishable_YWWft9FlaXff5WK9gRrrFA_6COoIwg4';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Deshabilitar el lock del navegador para evitar errores
    detectSessionInUrl: false,
    flowType: 'pkce',
    storage: localStorage, // Usar localStorage en lugar de sessionStorage
    storageKey: 'sb-alfynicevnplfbicouzub-auth-token',
    autoRefreshToken: true,
    persistSession: true,
    // 🔑 CLAVE: Deshabilitar el lock de navegador
    lock: false // <-- Esta línea evita el error del lock
  }
});