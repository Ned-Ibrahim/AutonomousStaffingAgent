// Health Edge Function (Deno). Reads the latest row from the `health` table and
// returns it. This is the server side of the walking-skeleton pipe: the browser
// invokes this function, it queries Postgres, and returns JSON. SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY are auto-injected into the Edge runtime by Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data, error } = await supabase
      .from('health')
      .select('status, created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error) throw error

    return new Response(JSON.stringify({ ok: true, db: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
