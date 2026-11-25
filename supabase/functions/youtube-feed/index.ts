import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

async function youtubeGet(path: string, params: Record<string, string>, apiKey: string) {
  const query = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetch("https://www.googleapis.com/youtube/v3/" + path + "?" + query);
  const payload = await response.json();
  if (!response.ok) {
    const reason = String(payload?.error?.errors?.[0]?.reason ?? "");
    if (["quotaExceeded", "dailyLimitExceeded", "userRateLimitExceeded"].includes(reason)) {
      throw new Error("מכסת הבקשות של YouTube API נוצלה. בדוק את המכסה ב-Google Cloud ונסה שוב מאוחר יותר.");
    }
    if (reason === "accessNotConfigured") {
      throw new Error("יש להפעיל את YouTube Data API v3 בפרויקט Google Cloud.");
    }
    const message = payload?.error?.message ?? "YouTube API request failed (" + response.status + ")";
    throw new Error(message);
  }
  return payload;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!authorization || !supabaseUrl || !anonKey) return json({ error: "unauthorized" }, 401);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return json({ error: "unauthorized" }, 401);

  const { data: artists, error: artistsError } = await supabase
    .from("user_artists")
    .select("channel_id, artist_name")
    .eq("user_id", userData.user.id);
  if (artistsError) return json({ error: "artists_query_failed" }, 500);
  if (!artists?.length) return json({ items: [], errors: [], fetched_at: new Date().toISOString() });

  const apiKey = Deno.env.get("YOUTUBE_API_KEY");
  if (!apiKey) {
    return json({
      error: "youtube_api_not_configured",
      message: "יש להוסיף את YOUTUBE_API_KEY לסודות של Edge Functions ב-Supabase כדי להפעיל תוצאות YouTube.",
      artists_count: artists.length,
    }, 503);
  }

  const since = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ channel_id: string; message: string }> = [];

  // channels.list is batched in groups of up to 50; reading each uploads playlist
  // avoids expensive broad search queries and preserves the channel's upload order.
  for (let offset = 0; offset < artists.length; offset += 50) {
    const batch = artists.slice(offset, offset + 50);
    let channels: any[] = [];
    try {
      const channelPayload = await youtubeGet("channels", {
        part: "contentDetails,snippet",
        id: batch.map((artist) => artist.channel_id).join(","),
        maxResults: "50",
      }, apiKey);
      channels = channelPayload.items ?? [];
    } catch (error) {
      for (const artist of batch) errors.push({
        channel_id: artist.channel_id,
        message: error instanceof Error ? error.message : "Channel lookup failed",
      });
      continue;
    }

    const byId = new Map(channels.map((channel) => [String(channel.id), channel]));
    for (const artist of batch) {
      const channel = byId.get(String(artist.channel_id));
      const uploadsPlaylist = channel?.contentDetails?.relatedPlaylists?.uploads;
      if (!uploadsPlaylist) {
        errors.push({ channel_id: artist.channel_id, message: "Channel or uploads playlist not found" });
        continue;
      }

      try {
        let pageToken: string | undefined;
        let shouldContinue = true;
        for (let page = 0; page < 4 && shouldContinue; page++) {
          const params: Record<string, string> = {
            part: "snippet,contentDetails",
            playlistId: uploadsPlaylist,
            maxResults: "50",
          };
          if (pageToken) params.pageToken = pageToken;
          const payload = await youtubeGet("playlistItems", params, apiKey);
          const items = payload.items ?? [];
          for (const item of items) {
            const snippet = item.snippet;
            const videoId = item.contentDetails?.videoId ?? snippet?.resourceId?.videoId;
            const publishedAt = item.contentDetails?.videoPublishedAt ?? snippet?.publishedAt;
            if (!videoId || !snippet || !publishedAt) continue;
            const publishedTime = Date.parse(publishedAt);
            if (!Number.isFinite(publishedTime)) continue;
            if (publishedTime < since) { shouldContinue = false; continue; }

            const title = String(snippet.title ?? "");
            const excluded = /interview|ראיון|reaction|תגובה|podcast|פודקאסט|full concert|live concert|הופעה מלאה|behind the scenes|מאחורי הקלעים/i.test(title);
            if (excluded) continue;

            const officialTerms = /official music video|official video|official audio|קליפ רשמי|סינגל רשמי/i.test(title);
            results.push({
              youtube_video_id: String(videoId),
              title,
              artist_name: artist.artist_name,
              channel_id: artist.channel_id,
              channel_title: String(channel.snippet?.title ?? ""),
              thumbnail_url: snippet.thumbnails?.high?.url ?? snippet.thumbnails?.medium?.url ?? snippet.thumbnails?.default?.url ?? null,
              published_at: publishedAt,
              video_url: "https://www.youtube.com/watch?v=" + videoId,
              official_confidence: officialTerms ? "medium" : "low",
              official_label: officialTerms ? "מועמד לתוכן רשמי" : "לא אומת כרשמי",
            });
          }
          pageToken = payload.nextPageToken;
          if (!pageToken || items.length === 0) shouldContinue = false;
        }
      } catch (error) {
        errors.push({
          channel_id: artist.channel_id,
          message: error instanceof Error ? error.message : "Playlist lookup failed",
        });
      }
    }
  }

  results.sort((a, b) => String(b.published_at ?? "").localeCompare(String(a.published_at ?? "")));
  return json({ items: results, errors, fetched_at: new Date().toISOString() });
});