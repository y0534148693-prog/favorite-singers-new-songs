import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, "Content-Type": "application/json" },
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !supabaseUrl || !anonKey) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return json({ error: "unauthorized" }, 401);

  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) return json({ error: "youtube_api_not_configured", message: "Add YOUTUBE_API_KEY to Supabase Edge Function secrets." }, 503);

  let body: { query?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const query = String(body.query ?? "").trim();
  if (query.length < 2 || query.length > 100) return json({ error: "invalid_query", message: "החיפוש חייב להכיל בין 2 ל-100 תווים." }, 400);

  const params = new URLSearchParams({
    key: apiKey, part: "snippet", type: "channel", q: query,
    maxResults: "12", order: "relevance",
  });
  try {
    const response = await fetch("https://www.googleapis.com/youtube/v3/search?" + params);
    const payload = await response.json();
    if (!response.ok) {
      return json({ error: "youtube_api_error", message: "YouTube API request failed (" + response.status + ")." }, 502);
    }
    const items = (payload.items ?? []).flatMap((item: any) => {
      const id = item.id?.channelId;
      const snippet = item.snippet;
      if (!id || !snippet) return [];
      return [{
        channel_id: id,
        title: String(snippet.title ?? ""),
        description: String(snippet.description ?? ""),
        thumbnail_url: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? null,
        channel_url: "https://www.youtube.com/channel/" + id,
      }];
    });
    return json({ items, fetched_at: new Date().toISOString() });
  } catch {
    return json({ error: "upstream_unavailable", message: "לא ניתן להתחבר ל-YouTube כרגע." }, 502);
  }
});
