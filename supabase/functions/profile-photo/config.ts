export type PhotoConfig={supabaseUrl:string;supabaseAnonKey:string};
export function loadConfig():PhotoConfig|null {const supabaseUrl=Deno.env.get('SUPABASE_URL')?.trim(),supabaseAnonKey=Deno.env.get('SUPABASE_ANON_KEY')?.trim();return supabaseUrl&&supabaseAnonKey?{supabaseUrl,supabaseAnonKey}:null;}
