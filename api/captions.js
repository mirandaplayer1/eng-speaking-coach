// Vercel serverless function：抓 YouTube 影片「原本就有的字幕」（作者上傳的或 YouTube 自動字幕），透過 Supadata 這個逐字稿 API 服務。
// YouTube 會擋雲端機房直接抓字幕，所以交給專門做這件事的服務。只用這個 Vercel 專案的環境變數 SUPADATA_API_KEY。
// mode=native：只拿現成字幕，每支影片 1 點（免費方案每月 100 點）；沒有字幕就回 404，前端再改用 Gemini 或手動貼。
// GET /api/captions?v=VIDEO_ID  ->  { video_id, lang, cues:[{start,end,text}] }
function parseVideoId(s) {
  s = String(s || "").trim();
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/) || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}
const decode = (t) => String(t || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const key = process.env.SUPADATA_API_KEY;
  if (!key) return res.status(500).json({ error: "Vercel 還沒設定 SUPADATA_API_KEY。", setup: true });
  const vid = parseVideoId(req.query.v);
  if (!vid) return res.status(400).json({ error: "這不是 YouTube 影片網址。" });
  const url = "https://api.supadata.ai/v1/transcript?mode=native&lang=en&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + vid);
  let r, j;
  try { r = await fetch(url, { headers: { "x-api-key": key } }); j = await r.json().catch(() => ({})); }
  catch (e) { return res.status(502).json({ error: "連不到字幕服務，請再試一次。" }); }
  if (r.status === 401 || r.status === 403) return res.status(500).json({ error: "SUPADATA_API_KEY 不對，請到 Vercel 檢查。", setup: true });
  if (r.status === 429) return res.status(429).json({ error: "這個月的免費字幕額度用完了。" });
  if (r.status === 202 || !r.ok) return res.status(404).json({ error: "這支影片沒有現成的英文字幕。", none: true });
  const segs = Array.isArray(j.content) ? j.content : [];
  const cues = segs.map((s) => ({ start: Math.round(s.offset / 100) / 10, end: Math.round((s.offset + s.duration) / 100) / 10, text: decode(s.text) })).filter((c) => c.text && Number.isFinite(c.start));
  if (!cues.length) return res.status(404).json({ error: "這支影片沒有現成的英文字幕。", none: true });
  res.setHeader("Cache-Control", "s-maxage=604800");
  return res.status(200).json({ video_id: vid, lang: j.lang || "en", cues });
}
