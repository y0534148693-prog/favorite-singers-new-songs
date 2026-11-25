import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
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

  let body: { google_access_token?: string };
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }
  const token = String(body.google_access_token ?? "");
  if (token.length < 20 || token.length > 5000) {
    return json({ error: "invalid_google_token", message: "נדרש חיבור Google תקף. אין לשמור את האסימון באתר." }, 400);
  }

  try {
    const items: Array<Record<string, unknown>> = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 4; page++) {
      const params = new URLSearchParams({
        part: "snippet,contentDetails",
        mine: "true",
        maxResults: "50",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const response = await fetch("https://www.googleapis.com/youtube/v3/subscriptions?" + params, {
        headers: { Authorization: "Bearer " + token },
      });
      const payload = await response.json();
      if (!response.ok) {
        const status = response.status === 401 || response.status === 403 ? 401 : 502;
        return json({
          error: "youtube_subscriptions_failed",
          message: status === 401
            ? "ההרשאה ל-YouTube פגה או לא כוללת את youtube.readonly. חבר מחדש את החשבון."
            : "YouTube לא הצליח להחזיר את רשימת המינויים כרגע.",
        }, status);
      }
      for (const item of payload.items ?? []) {
        const channel = item.snippet?.resourceId?.channelId;
        const snippet = item.snippet;
        if (!channel || !snippet) continue;
        items.push({
          channel_id: String(channel),
          title: String(snippet.title ?? ""),
          description: String(snippet.description ?? ""),
          thumbnail_url: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? null,
          channel_url: "https://www.youtube.com/channel/" + channel,
        });
      }
      pageToken = payload.nextPageToken;
      if (!pageToken) break;
    }
    return json({ items, count: items.length, fetched_at: new Date().toISOString() });
  } catch {
    return json({ error: "upstream_unavailable", message: "לא ניתן להתחבר ל-YouTube כרגע." }, 502);
  }
});