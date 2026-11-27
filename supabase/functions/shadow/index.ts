// Edge function: YouTube 影片 → 逐句英文字幕（含起訖秒數），給 shadowing 跟讀用。
// 部署在 reader 專案，沿用它的 GEMINI_API_KEY。用 SHADOW_PASS 擋掉陌生人，免得別人花你的額度。
//   POST { url, from?: 秒數 }  header: x-shadow-pass
//   -> { video_id, title, channel, from, to, lines:[{start,end,text}], more }
// 一次處理 5 分鐘，前端看到哪裡再要下一段。
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-shadow-pass, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const CHUNK = 300;
const GEMINI = "https://generativelanguage.googleapis.com/v1beta";

function parseVideoId(url: string) {
  const s = String(url || "").trim();
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}
// "1:02.5" / "62.5" -> 62.5
function secs(v: unknown) {
  if (typeof v === "number") return v;
  const p = String(v ?? "").trim().split(":").map(Number);
  if (!p.length || p.some((x) => !Number.isFinite(x))) return NaN;
  return p.reduce((a, x) => a * 60 + x, 0);
}
const clock = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;

const SCHEMA = {
  type: "OBJECT",
  properties: {
    lines: { type: "ARRAY", items: { type: "OBJECT", properties: { start: { type: "STRING" }, end: { type: "STRING" }, text: { type: "STRING" } }, required: ["start", "end", "text"] } },
    reached_end: { type: "BOOLEAN" },
  },
  required: ["lines", "reached_end"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const pass = Deno.env.get("SHADOW_PASS");
  if (!pass) return json({ error: "後端還沒設定 SHADOW_PASS。" }, 500);
  if (req.headers.get("x-shadow-pass") !== pass) return json({ error: "通行碼不對，到「設定」檢查。" }, 401);
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "後端沒有 GEMINI_API_KEY。" }, 500);
  const model = Deno.env.get("GEMINI_VIDEO_MODEL") || "gemini-3.8-flash";
  const body = await req.json().catch(() => ({}));
  const vid = parseVideoId(body.url);
  if (!vid) return json({ error: "這不是 YouTube 影片網址。" }, 400);
  const from = Math.max(0, Math.floor(Number(body.from) || 0)), to = from + CHUNK;
  const url = "https://www.youtube.com/watch?v=" + vid;

  let title = "", channel = "";
  if (!from) {
    try { const r = await fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent(url)); if (r.ok) { const j = await r.json(); title = j.title || ""; channel = j.author_name || ""; } } catch (_) { /* optional */ }
  }

  const prompt =
    `Transcribe the English speech in this clip (from ${clock(from)} to ${clock(to)} of the full video) for a shadowing exercise.\n` +
    `Return JSON only: {"lines":[{"start":"M:SS.s","end":"M:SS.s","text":"..."}],"reached_end":true|false}\n` +
    `- One line per spoken sentence or natural phrase, 4 to 16 words. Split long sentences at natural pauses.\n` +
    `- "start" and "end" are times in the FULL video (not relative to the clip), with tenths of a second, as tight as possible around the speech.\n` +
    `- Verbatim words with normal punctuation and capitalisation. Do not summarise, skip or translate. Leave out music and sound effects.\n` +
    `- "reached_end" is true only if the video itself ends before ${clock(to)}.`;
  const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ file_data: { file_uri: url }, video_metadata: { start_offset: from + "s", end_offset: to + "s" } }, { text: prompt }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: SCHEMA, temperature: 0, maxOutputTokens: 16384 },
    }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return json({ error: out?.error?.message || "Gemini 失敗（" + res.status + "）" }, res.status === 429 ? 429 : 502);
  const text = (out.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("");
  let data: any;
  try { data = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "")); } catch (_) { return json({ error: "字幕格式錯誤，請重試。" }, 502); }
  let lines = (Array.isArray(data.lines) ? data.lines : [])
    .map((l: any) => ({ start: secs(l.start), end: secs(l.end), text: String(l.text || "").trim() }))
    .filter((l: any) => l.text && Number.isFinite(l.start));
  // 有些回應給的是相對於片段的時間：全部落在片段之前就整體平移
  if (lines.length && from > 0 && Math.max(...lines.map((l: any) => l.start)) < from) lines = lines.map((l: any) => ({ ...l, start: l.start + from, end: l.end + from }));
  lines = lines.sort((a: any, b: any) => a.start - b.start).map((l: any, i: number, arr: any[]) => {
    const next = arr[i + 1] ? arr[i + 1].start : l.start + 8;
    const end = Number.isFinite(l.end) && l.end > l.start ? Math.min(l.end, next + 0.3) : next;
    return { start: Math.round(l.start * 10) / 10, end: Math.round(end * 10) / 10, text: l.text };
  });
  return json({ video_id: vid, title, channel, from, to, lines, more: !data.reached_end && lines.length > 0 });
});
