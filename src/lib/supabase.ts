import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY doivent être définis (voir .env.example)');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Lien magique en PKCE : le lien ne contient qu'un code, échangé contre
    // une session avec le code_verifier gardé sur l'appareil qui l'a demandé
    // (AuthContext) — plus de jetons en clair dans l'URL.
    flowType: 'pkce',
  },
});
