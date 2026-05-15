console.log('URL cargada:', process.env.REACT_APP_SUPABASE_URL);
console.log('Key cargada:', process.env.REACT_APP_SUPABASE_ANON_KEY ? '✅' : '❌');

import { createClient } 

from '@supabase/supabase-js';

const supabaseUrl = 'https://alfynicevnplfbicouzb.supabase.co'; // <- tu URL
const supabaseAnonKey = 'sb_publishable_YWWft9FlaXff5WK9gRrrFA_6COoIwg4';       // <- tu anon key

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

supabase.from('companies').select('*', { count: 'exact', head: true }).then(console.log);