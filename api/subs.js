// Vercel serverless function：用 Google 官方 Gemini API 讀 YouTube 影片，產生逐句英文字幕（含起訖秒數）給 shadowing 用。
// 獨立服務，只用這個 Vercel 專案自己的環境變數 GEMINI_API_KEY（可選 GEMINI_MODEL）。
// GET /api/subs?v=VIDEO_ID&from=秒數  ->  { video_id, title, from, to, lines:[{start,end,text}], more }
// 一次 5 分鐘，前端看到哪裡再要下一段；結果在 Vercel CDN 快取一天，同一段不會重複花額度。
const CHUNK = 300;
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";
const SCHEMA = {
  type: "OBJECT",
  properties: {
    lines: { type: "ARRAY", items: { type: "OBJECT", properties: { start: { type: "STRING" }, end: { type: "STRING" }, text: { type: "STRING" } }, required: ["start", "end", "text"] } },
    reached_end: { type: "BOOLEAN" },
  },
  required: ["lines", "reached_end"],
};

function parseVideoId(s) {
  s = String(s || "").trim();
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}
function secs(v) {
  if (typeof v === "number") return v;
  const p = String(v ?? "").trim().split(":").map(Number);
  if (!p.length || p.some((x) => !Number.isFinite(x))) return NaN;
  return p.reduce((a, x) => a * 60 + x, 0);
}
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Vercel 還沒設定 GEMINI_API_KEY。", setup: true });
  const vid = parseVideoId(req.query.v);
  if (!vid) return res.status(400).json({ error: "這不是 YouTube 影片網址。" });
  const from = Math.floor(Math.max(0, Number(req.query.from) || 0) / CHUNK) * CHUNK, to = from + CHUNK;
  const url = "https://www.youtube.com/watch?v=" + vid;

  let title = "";
  if (!from) {
    try { const r = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url)); if (r.ok) title = (await r.json()).title || ""; } catch (_) { /* 標題可有可無 */ }
  }
  const prompt =
    `Transcribe the English speech in this clip (from ${clock(from)} to ${clock(to)} of the full video) for a shadowing exercise.\n` +
    `- One line per spoken sentence or natural phrase, 4 to 16 words. Split long sentences at natural pauses.\n` +
    `- "start" and "end" are times in the FULL video (not relative to the clip) as M:SS.s, as tight as possible around the speech.\n` +
    `- Verbatim words with normal punctuation and capitalisation. Do not summarise, skip or translate. Leave out music and sound effects.\n` +
    `- "reached_end" is true only if the video itself ends before ${clock(to)}.`;
  const r = await fetch(`${GEMINI}/models/${process.env.GEMINI_MODEL || "gemini-3.8-flash"}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ file_data: { file_uri: url }, video_metadata: { start_offset: from + "s", end_offset: to + "s" } }, { text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0, maxOutputTokens: 16384, mediaResolution: "MEDIA_RESOLUTION_LOW" },
    }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ error: r.status === 429 ? "今天的 Gemini 免費額度用完了，明天再試，或先手動貼逐字稿。" : out?.error?.message || "Gemini 失敗（" + r.status + "）" });
  const text = (out.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  let data;
  try { data = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch (_) { return res.status(502).json({ error: "字幕格式錯誤，請重試。" }); }
  let lines = (Array.isArray(data.lines) ? data.lines : [])
    .map((l) => ({ start: secs(l.start), end: secs(l.end), text: String(l.text || "").trim() }))
    .filter((l) => l.text && Number.isFinite(l.start));
  // 有些回應給的是相對於片段的時間：全部落在片段之前就整體平移
  if (lines.length && from > 0 && Math.max(...lines.map((l) => l.start)) < from) lines = lines.map((l) => ({ ...l, start: l.start + from, end: l.end + from }));
  lines = lines.sort((a, b) => a.start - b.start).map((l, i, a) => {
    const next = a[i + 1] ? a[i + 1].start : l.start + 8;
    const end = Number.isFinite(l.end) && l.end > l.start ? Math.min(l.end, next + 0.3) : next;
    return { start: Math.round(l.start * 10) / 10, end: Math.round(end * 10) / 10, text: l.text };
  });
  res.setHeader("Cache-Control", "s-maxage=86400");
  return res.status(200).json({ video_id: vid, title, from, to, lines, more: !data.reached_end && lines.length > 0 });
}
