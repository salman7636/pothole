import { createClient } from '@supabase/supabase-js';

// Supabase publishable keys are designed to be used by browser clients.
const DEFAULT_SUPABASE_URL = "https://pgcrtyedhjmghxzrastj.supabase.co";
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_yhoVI3yRp7p1Yhc-tj66Zw_gICfZGgc";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
    || DEFAULT_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    || import.meta.env.VITE_SUPABASE_ANON_KEY
    || DEFAULT_SUPABASE_PUBLISHABLE_KEY;

export const supabase = supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey)
    : null;
