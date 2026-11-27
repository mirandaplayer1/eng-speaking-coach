// Shadowing：YouTube 影片 + 逐句字幕。點一句重播那一句，錄自己跟讀，Azure 用那一句當標準評分。
// 字幕：使用者貼上逐字稿（YouTube「顯示逐字稿」、SRT、VTT），解析時間點並合併成句子，存在這台手機。
(function () {
    const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cls = s => s >= 80 ? "g" : s >= 60 ? "m" : "b";
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
  const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const clock = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
  const IC = {
    play: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 5l12 7-12 7z" fill="currentColor"/></svg>',
    mic: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
    loop: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a6 6 0 0 1 6-6h8l-3-3M20 12a6 6 0 0 1-6 6H6l3 3"/></svg>'
  };

  let V = null;      // { id, title, lines, timed, err, editing }
  let player = null, ready = false, tick = null;
  let cur = -1;      // 現在這一句
  let stopAt = null; // 播到這裡暫停
  let pausedAt = -1;
  let opt = load("shadow-opt", { rate: 1, loop: false, pause: true });
  let rec = {};      // line index -> { state, result, err }
  const audio = new Audio(); let aurl = null;

  /* ---------- 字幕 ---------- */
  const cacheKey = id => "shadow-" + id;
  // 解析貼上的逐字稿：YouTube「顯示逐字稿」複製的內容、SRT、VTT 都可以。沒有時間點也行（只是不能點句重播）。
  function toSec(t) { const p = t.replace(",", ".").split(":").map(Number); return p.reduce((a, x) => a * 60 + x, 0); }
  function parseTranscript(raw) {
    const TIME = /^(\d{1,2}:)?\d{1,2}:\d{2}([.,]\d+)?/;
    const rows = String(raw || "").replace(/\r/g, "").split("\n").map(x => x.trim())
      .filter(x => x && x !== "WEBVTT" && !/^\d+$/.test(x) && !/^\d+\s*(秒|分鐘|seconds?|minutes?|hours?)([,，、\s]*\d+\s*(秒|分鐘|seconds?|minutes?))*$/i.test(x) && !/^(NOTE|Kind:|Language:)/.test(x));
    const cues = []; let pend = null;
    for (const x of rows) {
      const srt = x.match(/^((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d+)\s*-->\s*((?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d+)/);
      if (srt) { pend = { start: toSec(srt[1]), end: toSec(srt[2]), text: "" }; cues.push(pend); continue; }
      const m = x.match(TIME);
      if (m) { const rest = x.slice(m[0].length).trim(); pend = { start: toSec(m[0]), text: rest }; cues.push(pend); continue; }
      const text = x.replace(/<[^>]+>/g, "").replace(/^\[.*\]$/, "");
      if (!text) continue;
      if (pend) pend.text = (pend.text + " " + text).trim(); else cues.push({ start: null, text });
    }
    const timed = cues.filter(c => c.start != null && c.text).length > 0;
    let cs = cues.filter(c => c.text && (!timed || c.start != null));
    if (!timed) cs = cs.flatMap(c => (c.text.match(/[^.?!]+[.?!]+["'”’)]?|[^.?!]+$/g) || [c.text]).map(t => ({ start: null, text: t.trim() })).filter(c => c.text));
    // 合併成句子：遇到 . ? ! 斷；沒有標點的自動字幕就每 14 字斷
    const punct = cs.some(c => /[.?!]["'”’)]?$/.test(c.text));
    const out = []; let cur = null;
    const wc = t => t.split(/\s+/).length, max = punct ? 22 : 14;
    cs.forEach((c, i) => {
      if (cur && wc(cur.text) + wc(c.text) > max) { cur.end = c.start; out.push(cur); cur = null; }
      if (!cur) cur = { start: c.start, text: c.text }; else cur.text += " " + c.text;
      if (punct && /[.?!]["'”’)]?$/.test(cur.text)) { cur.end = c.end ?? (cs[i + 1] ? cs[i + 1].start : null); out.push(cur); cur = null; }
    });
    if (cur) { const l = cs[cs.length - 1]; cur.end = l.end ?? (l.start != null ? l.start + 5 : null); out.push(cur); }
    return out.map((l, i) => {
      const next = out[i + 1] && out[i + 1].start;
      let end = l.end != null ? l.end : next != null ? next : l.start != null ? l.start + 5 : null;
      if (next != null && end > next + 0.3) end = next + 0.3;
      return { start: l.start, end, text: l.text.replace(/\s+/g, " ").replace(/^./, c => c.toUpperCase()) };
    }).filter(l => l.text.split(" ").length >= 1);
  }
  function saveTranscript() {
    const lines = parseTranscript($("#tx").value);
    if (!lines.length) { V.err = "看不懂這段內容，確定有貼上英文逐字稿嗎？"; return draw(); }
    V.lines = lines; V.err = null; V.timed = lines.some(l => l.start != null); V.editing = false;
    store(cacheKey(V.id), { title: V.title, lines: V.lines, timed: V.timed });
    if (V.title) window.dispatchEvent(new CustomEvent("shadow-title", { detail: { id: V.id, title: V.title } }));
    draw();
  }

  /* ---------- YouTube 播放器 ---------- */
  function ytApi() {
    return new Promise(res => {
      if (window.YT && YT.Player) return res();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev && prev(); res(); };
      if (!document.getElementById("yt-api")) { const s = document.createElement("script"); s.id = "yt-api"; s.src = "https://www.youtube.com/iframe_api"; document.head.appendChild(s); }
    });
  }
  async function mountPlayer() {
    await ytApi();
    if (!V) return;
    player = new YT.Player("yt", {
      videoId: V.id,
      playerVars: { playsinline: 1, rel: 0, modestbranding: 1, cc_load_policy: 0 },
      events: { onReady: () => { ready = true; try { player.setPlaybackRate(opt.rate); } catch (e) {} } }
    });
    tick = setInterval(onTick, 150);
  }
  function onTick() {
    if (!ready || !V) return;
    let t = 0; try { t = player.getCurrentTime(); } catch (e) { return; }
    if (stopAt != null && t >= stopAt) {
      if (opt.loop && cur >= 0) { player.seekTo(V.lines[cur].start, true); return; }
      player.pauseVideo(); stopAt = null;
    }
    if (!V.timed) return;
    const i = V.lines.findIndex((l, k) => t >= l.start - 0.05 && t < (V.lines[k + 1] ? V.lines[k + 1].start : l.end + 1));
    if (i >= 0 && i !== cur && stopAt == null) { cur = i; highlight(true); }
    // 自動暫停：連續播放時，每句播完停下來讓你跟讀（同一句只停一次）
    if (opt.pause && stopAt == null && cur >= 0 && pausedAt !== cur && player.getPlayerState() === 1 && t >= V.lines[cur].end) { pausedAt = cur; player.pauseVideo(); }
  }
  function playLine(i) {
    if (!V.lines[i]) return;
    if (!ready || V.lines[i].start == null) {   // 沒有時間點：用語音合成唸這句
      cur = i; highlight(false);
      try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(V.lines[i].text); u.lang = "en-US"; u.rate = opt.rate; speechSynthesis.speak(u); } catch (e) {}
      return;
    }
    try { speechSynthesis.cancel(); audio.pause(); } catch (e) {}
    cur = i; pausedAt = i; const l = V.lines[i];
    stopAt = l.end + 0.15;
    player.seekTo(Math.max(0, l.start - 0.1), true); player.playVideo();
    highlight(true);
  }

  /* ---------- 錄音跟讀 ---------- */
  function playBlob(b) {
    if (!b) return;
    try { player && player.pauseVideo(); } catch (e) {}
    if (aurl) URL.revokeObjectURL(aurl); aurl = URL.createObjectURL(b); audio.src = aurl; audio.play().catch(() => {});
  }
  function shadowRec(i) {
    const r = rec[i] || (rec[i] = {});
    if (r.state === "listening") { Azure.stop(); r.state = "processing"; return drawLine(i); }
    if (r.state === "processing") return;
    try { player && player.pauseVideo(); audio.pause(); } catch (e) {}
    stopAt = null;
    r.state = "listening"; r.err = null; drawLine(i);
    Azure.assess(V.lines[i].text, st => { r.state = st; drawLine(i); })
      .then(res => { r.state = "done"; r.result = res; drawLine(i); window.dispatchEvent(new CustomEvent("shadow-scored", { detail: res })); })
      .catch(e => { if (e.code === "aborted") return; r.state = "error"; r.err = e.message; drawLine(i); });
  }
  function origThenMine(i) {
    const r = rec[i]; if (!r || !r.result) return;
    playLine(i);
    const l = V.lines[i], wait = l.start != null ? (l.end - l.start + 0.6) * 1000 / opt.rate : 400 * l.text.split(" ").length / opt.rate;
    setTimeout(() => playBlob(r.result.audio), wait);
  }

  /* ---------- 畫面 ---------- */
  function lineHtml(l, i) {
    const r = rec[i] || {}, on = i === cur;
    let body = `<span class="ln-t">${l.start != null ? clock(l.start) : "第 " + (i + 1) + " 句"}</span><span class="ln-x">${esc(l.text)}</span>`;
    if (r.result) {
      body = `<span class="ln-t">${l.start != null ? clock(l.start) : "第 " + (i + 1) + " 句"}</span><span class="ln-x">${r.result.words.map(w => `<b class="${w.err === "Omission" ? "b" : cls(w.score)}">${esc(w.w)}</b>`).join(" ")}</span>`;
    }
    let act = "";
    if (on) {
      const st = r.state;
      const bad = r.result ? r.result.words.flatMap(w => w.phon.map(p => ({ w: w.w, ...p }))).filter(p => p.score < 60).sort((a, b) => a.score - b.score).slice(0, 2) : [];
      act = `<div class="ln-act">
        <button class="pill" data-lp="${i}">${IC.play}原聲</button>
        <button class="pill rec${st === "listening" ? " on" : ""}" data-lr="${i}">${IC.mic}${st === "listening" ? "唸完按這裡" : st === "processing" ? "評分中…" : r.result ? "再跟讀" : "跟讀"}</button>
        ${r.result ? `<button class="pill" data-lm="${i}">${IC.play}我的</button><button class="pill" data-lab="${i}">原聲→我</button>` : ""}
      </div>
      ${r.err ? `<p class="err" style="margin:8px 0 0;font-size:14px">${esc(r.err)}</p>` : ""}
      ${r.result ? `<div class="ln-res"><span class="badge ${cls(r.result.scores.pron)}">${r.result.scores.pron}</span><span class="mute">準確 ${r.result.scores.acc}・流暢 ${r.result.scores.flu}${r.result.scores.pros != null ? "・語調 " + r.result.scores.pros : ""}</span></div>
        ${bad.map(p => { const t = (window.TIPS || {})[p.p]; const like = p.nbest.find(n => n.p !== p.p && n.score > p.score); return `<p class="ln-fix"><b>${esc(p.w)}</b> 的 /${esc(p.p)}/ ${p.score} 分${like ? `，像 /${esc(like.p)}/` : ""}。${esc(t ? t.how : "")}</p>`; }).join("")}` : ""}`;
    }
    return `<div class="ln${on ? " on" : ""}" id="ln${i}" data-li="${i}">${body}${act}</div>`;
  }
  function drawLine(i) { const el = document.getElementById("ln" + i); if (el) el.outerHTML = lineHtml(V.lines[i], i); }
  function highlight(scroll) {
    const box = $("#lines"); if (!box) return;
    box.querySelectorAll(".ln.on").forEach(el => { const k = +el.dataset.li; if (k !== cur) drawLine(k); });
    drawLine(cur);
    if (scroll) { const el = document.getElementById("ln" + cur); el && el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  function draw() {
    const box = $("#lines"); if (!box || !V) return;
    $("#shtitle").textContent = V.title || "影片跟讀";
    if (!V.lines.length || V.editing) {
      box.innerHTML = `<div class="paste">
        <h3>貼上這支影片的英文逐字稿</h3>
        <ol class="steps"><li>在電腦或 iPad 打開這支 YouTube 影片</li><li>按影片說明下方的「顯示逐字稿」</li><li>全選逐字稿（含時間）複製，貼到下面</li></ol>
        <p class="mute">也可以貼 .srt 或 .vtt 字幕檔的內容。沒有時間點也能練，只是不能點句子跳到影片那一段。</p>
        <textarea id="tx" rows="8" placeholder="0:01&#10;Hi everyone, welcome back.&#10;0:04&#10;Today we're talking about..."></textarea>
        ${V.err ? `<p class="err">${esc(V.err)}</p>` : ""}
        <div style="display:flex;gap:8px;margin-top:10px"><button class="big" data-txsave style="flex:1">產生逐句字幕</button>${V.lines.length ? `<button class="big secondary" data-txcancel style="flex:none;width:auto;padding:0 18px">取消</button>` : ""}</div>
      </div>`;
      return;
    }
    box.innerHTML = V.lines.map(lineHtml).join("") +
      `<p class="mute" style="text-align:center;margin:14px 0">${V.timed ? "" : "這份逐字稿沒有時間點，點句子不會跳到影片。"}<button class="del" data-txedit>重新貼逐字稿</button></p>`;
  }
  function opts() {
    return `<button class="chip" data-sopt="rate" aria-pressed="${opt.rate < 1}">慢速 0.75×</button>
      <button class="chip" data-sopt="pause" aria-pressed="${opt.pause}">每句停</button>
      <button class="chip" data-sopt="loop" aria-pressed="${opt.loop}">${IC.loop} 循環這句</button>`;
  }

  function open(v) {
    const cached = load(cacheKey(v.id), null);
    V = { id: v.id, title: (cached && cached.title) || v.title || "", lines: cached && cached.lines || [], timed: cached ? cached.timed !== false : true, err: null, editing: false };
    if (!V.title) fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + v.id)).then(r => r.ok ? r.json() : null).then(j => { if (j && j.title && V && V.id === v.id) { V.title = j.title; $("#shtitle").textContent = j.title; window.dispatchEvent(new CustomEvent("shadow-title", { detail: { id: v.id, title: j.title } })); } }).catch(() => {});
    cur = -1; stopAt = null; pausedAt = -1; rec = {}; ready = false;
    const el = $("#shadow");
    el.innerHTML = `<div class="sh-top"><button class="x" data-sclose aria-label="關閉">×</button><b id="shtitle" class="sh-title"></b></div>
      <div class="sh-video"><div class="frame"><div id="yt"></div></div><div class="chips" id="sopts">${opts()}</div></div>
      <div class="sh-body" id="lines"></div>`;
    el.hidden = false; document.getElementById("tabs").hidden = true;
    draw(); mountPlayer();
  }
  function close() {
    clearInterval(tick); tick = null;
    try { player && player.destroy(); } catch (e) {}
    player = null; ready = false; Azure.cancel(); audio.pause(); V = null;
    $("#shadow").hidden = true; $("#shadow").innerHTML = ""; document.getElementById("tabs").hidden = false;
  }

  document.addEventListener("click", e => {
    if (!V) return;
    const t = e.target.closest("button,[data-li]"); if (!t || !t.closest("#shadow")) return;
    const d = t.dataset;
    if ("sclose" in d) return close();
    if ("txsave" in d) return saveTranscript();
    if ("txedit" in d) { V.editing = true; return draw(); }
    if ("txcancel" in d) { V.editing = false; V.err = null; return draw(); }
    if (d.sopt) {
      if (d.sopt === "rate") { opt.rate = opt.rate < 1 ? 1 : .75; try { player.setPlaybackRate(opt.rate); } catch (e) {} }
      else opt[d.sopt] = !opt[d.sopt];
      store("shadow-opt", opt); $("#sopts").innerHTML = opts(); return;
    }
    if (d.lp != null) return playLine(+d.lp);
    if (d.lr != null) return shadowRec(+d.lr);
    if (d.lm != null) return playBlob(rec[+d.lm] && rec[+d.lm].result && rec[+d.lm].result.audio);
    if (d.lab != null) return origThenMine(+d.lab);
    if (d.li != null && t.tagName !== "BUTTON") { const i = +d.li; if (i !== cur) playLine(i); }
  });

  window.Shadow = { open, close };
})();
