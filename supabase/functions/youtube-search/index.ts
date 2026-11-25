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
      const reason = String(payload?.error?.errors?.[0]?.reason ?? "");
      const message = ["quotaExceeded", "dailyLimitExceeded", "userRateLimitExceeded"].includes(reason)
        ? "מכסת הבקשות של YouTube API נוצלה. בדוק את המכסה ב-Google Cloud ונסה שוב מאוחר יותר."
        : reason === "accessNotConfigured"
          ? "יש להפעיל את YouTube Data API v3 בפרויקט Google Cloud."
          : "YouTube API לא הצליח לבצע את החיפוש כרגע (" + response.status + ").";
      return json({ error: "youtube_api_error", message }, 502);
    }
    const searchItems = (payload.items ?? []).filter((item: any) => item.id?.channelId && item.snippet);
    const ids = searchItems.map((item: any) => String(item.id.channelId));
    let statsById = new Map<string, any>();
    if (ids.length) {
      const statsParams = new URLSearchParams({
        key: apiKey,
        part: "snippet,statistics",
        id: ids.join(","),
        maxResults: "50",
      });
      const statsResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?" + statsParams);
      const statsPayload = await statsResponse.json();
      if (statsResponse.ok) statsById = new Map((statsPayload.items ?? []).map((channel: any) => [String(channel.id), channel]));
    }
    const items = searchItems.map((item: any) => {
      const id = String(item.id.channelId);
      const snippet = item.snippet;
      const channel = statsById.get(id);
      const statistics = channel?.statistics ?? {};
      return {
        channel_id: id,
        title: String(snippet.title ?? ""),
        description: String(snippet.description ?? ""),
        thumbnail_url: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? null,
        channel_url: "https://www.youtube.com/channel/" + id,
        custom_url: channel?.snippet?.customUrl ?? null,
        subscriber_count: statistics.hiddenSubscriberCount ? null : Number(statistics.subscriberCount ?? 0),
        view_count: Number(statistics.viewCount ?? 0),
        video_count: Number(statistics.videoCount ?? 0),
      };
    });
    return json({ items, fetched_at: new Date().toISOString() });
  } catch {
    return json({ error: "upstream_unavailable", message: "לא ניתן להתחבר ל-YouTube כרגע." }, 502);
  }
});
