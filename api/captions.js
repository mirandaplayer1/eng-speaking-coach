// Vercel serverless function：抓 YouTube 原本的英文字幕，整理成逐句（含起訖秒數）給 shadowing 用。
// GET /api/captions?v=VIDEO_ID  ->  { video_id, title, source: "youtube" | "youtube-auto", lines:[{start,end,text}] }
// 沒有英文字幕就回 404，不用任何 AI。
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function parseVideoId(s) {
  s = String(s || "").trim();
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}

async function captionTracks(vid) {
  // 1) 網頁版播放頁裡的 ytInitialPlayerResponse
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${vid}&hl=en`, { headers: { "user-agent": UA, "accept-language": "en-US,en;q=0.9", cookie: "CONSENT=YES+1" } });
    const html = await r.text();
    const m = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\})\s*;\s*(?:var\s|<\/script>)/s);
    const p = m ? JSON.parse(m[1]) : null;
    const tracks = p?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length) return { tracks, title: p?.videoDetails?.title || "" };
  } catch (_) { /* 試下一個 */ }
  // 2) Android App 的 player API
  try {
    const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": "com.google.android.youtube/19.09.37 (Linux; U; Android 14) gzip" },
      body: JSON.stringify({ videoId: vid, context: { client: { clientName: "ANDROID", clientVersion: "19.09.37", androidSdkVersion: 34, hl: "en" } } }),
    });
    const j = await r.json();
    const tracks = j?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (Array.isArray(tracks) && tracks.length) return { tracks, title: j?.videoDetails?.title || "" };
  } catch (_) { /* 沒有 */ }
  return { tracks: [], title: "" };
}

// 人工字幕：每個 cue 是一段文字，合併成完整句子（遇到 . ? ! 或太長就斷）
function cuesToLines(events) {
  const cues = events.filter((e) => e.segs).map((e) => ({
    start: e.tStartMs / 1000, end: (e.tStartMs + (e.dDurationMs || 0)) / 1000,
    text: e.segs.map((s) => s.utf8 || "").join("").replace(/\s+/g, " ").trim(),
  })).filter((c) => c.text && !/^\[.*\]$/.test(c.text));
  const out = []; let cur = null;
  for (const c of cues) {
    if (!cur) cur = { ...c }; else { cur.text += " " + c.text; cur.end = c.end; }
    if (/[.?!]["'”’)]?$/.test(cur.text) || cur.text.split(" ").length >= 18 || cur.end - cur.start > 9) { out.push(cur); cur = null; }
  }
  if (cur) out.push(cur);
  return out;
}

// 自動字幕：逐字有時間但沒有標點，用停頓切句
function asrToLines(events) {
  const words = [];
  for (const e of events) for (const s of e.segs || []) { const w = (s.utf8 || "").trim(); if (w) words.push({ t: (e.tStartMs + (s.tOffsetMs || 0)) / 1000, w }); }
  const out = []; let cur = null;
  words.forEach((x, i) => {
    if (cur && (x.t - cur.last > 0.7 || cur.ws.length >= 14)) { out.push({ start: cur.start, end: cur.last + 0.4, text: cur.ws.join(" ") }); cur = null; }
    if (!cur) cur = { start: x.t, ws: [], last: x.t };
    cur.ws.push(x.w); cur.last = x.t;
    if (i === words.length - 1) out.push({ start: cur.start, end: cur.last + 0.6, text: cur.ws.join(" ") });
  });
  return out.map((l) => ({ ...l, text: l.text.charAt(0).toUpperCase() + l.text.slice(1) }));
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(204).end();
  const vid = parseVideoId(req.query.v || req.query.url);
  if (!vid) return res.status(400).json({ error: "這不是 YouTube 影片網址。" });
  try {
    const { tracks, title } = await captionTracks(vid);
    const en = tracks.filter((t) => /^en/.test(t.languageCode || ""));
    const pick = en.find((t) => t.kind !== "asr") || en.find((t) => t.kind === "asr");
    if (!pick) return res.status(404).json({ error: tracks.length ? "這支影片沒有英文字幕。" : "抓不到這支影片的字幕（可能沒有字幕，或 YouTube 暫時擋住）。", video_id: vid, title });
    const r = await fetch(pick.baseUrl + "&fmt=json3", { headers: { "user-agent": UA } });
    const txt = await r.text();
    if (!r.ok || !txt) return res.status(502).json({ error: "YouTube 沒有回傳字幕內容，稍後再試。", video_id: vid, title });
    const events = JSON.parse(txt).events || [];
    const raw = pick.kind === "asr" ? asrToLines(events) : cuesToLines(events);
    const lines = raw.map((l, i, a) => ({
      start: Math.round(l.start * 10) / 10,
      end: Math.round(Math.min(l.end, a[i + 1] ? a[i + 1].start + 0.2 : l.end) * 10) / 10,
      text: l.text,
    }));
    res.setHeader("Cache-Control", "s-maxage=86400");
    return res.status(200).json({ video_id: vid, title, source: pick.kind === "asr" ? "youtube-auto" : "youtube", lines });
  } catch (e) {
    return res.status(502).json({ error: "抓字幕失敗：" + (e && e.message || e) });
  }
}
