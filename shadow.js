// Shadowing：YouTube 影片 + 逐句字幕。點一句重播那一句，錄自己跟讀，Azure 用那一句當標準評分。
// 字幕：先用 /api/subs（Vercel 上的 Gemini 服務）自動產生；失敗或在 GitHub Pages 上就手動貼逐字稿（YouTube「顯示逐字稿」、SRT、VTT）。存在這台手機。
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
    next: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    loop: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12a6 6 0 0 1 6-6h8l-3-3M20 12a6 6 0 0 1-6 6H6l3 3"/></svg>'
  };

  let V = null;      // { id, title, lines, timed, err, editing }
  let player = null, ready = false, tick = null;
  let cur = -1;      // 現在這一句
  let stopAt = null; // 播到這裡暫停
  let pausedAt = -1;
  let opt = load("shadow-opt", { rate: 1, loop: false, pause: true });

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
  // 自動產生：/api/subs（Vercel 上的 Gemini 服務），一次 5 分鐘。失敗就退回手動貼。
  async function autoSubs() {
    const v = V;
    if (!v || v.loading || v.more === false || location.hostname.endsWith("github.io")) { if (v && !v.lines.length) v.editing = true; return v && draw(); }
    v.loading = true; v.err = null; draw();
    // 第一步：影片原本就有的字幕（/api/captions）。有就直接用完整一份，不用再分段。
    let capErr = null;
    if (!v.lines.length && !v.next && !v.capTried) {
      v.capTried = true;
      try {
        const r = await fetch("/api/captions?v=" + encodeURIComponent(v.id));
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.cues && j.cues.length) {
          // 轉成「時間 + 句子」文字，交給同一套斷句邏輯合併成完整句子
          const lines = parseTranscript(j.cues.map(c => `${Math.floor(c.start / 60)}:${(c.start % 60).toFixed(2).padStart(5, "0")}\n${c.text}`).join("\n"));
          if (lines.length) {
            Object.assign(v, { lines, more: false, next: 0, timed: true, auto: true, loading: false, src: "captions" });
            store(cacheKey(v.id), { title: v.title, lines: v.lines, timed: true, auto: true, more: false, next: 0 });
            if (V === v) draw(); return;
          }
        }
        capErr = j.error || null;
      } catch (e) { capErr = null; }
    }
    try {
      const r = await fetch("/api/subs?v=" + encodeURIComponent(v.id) + "&from=" + (v.next || 0));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.setup && capErr ? capErr + (/SUPADATA/.test(capErr) ? "" : "Gemini 也還沒設定。") : j.error || "自動產生字幕失敗（" + r.status + "）");
      if (j.title) v.title = j.title;
      const last = v.lines.length ? v.lines[v.lines.length - 1].start : -1;
      v.lines = v.lines.concat((j.lines || []).filter(l => l.start > last + 0.5));
      v.more = !!j.more; v.next = j.to; v.timed = true; v.auto = true;
      store(cacheKey(v.id), { title: v.title, lines: v.lines, timed: true, auto: true, more: v.more, next: v.next });
      if (v.title) window.dispatchEvent(new CustomEvent("shadow-title", { detail: { id: v.id, title: v.title } }));
    } catch (e) { v.err = e.message; if (!v.lines.length) v.editing = true; }
    v.loading = false;
    if (V === v) draw();
  }
  function saveTranscript() {
    const lines = parseTranscript($("#tx").value);
    if (!lines.length) { V.err = "看不懂這段內容，確定有貼上英文逐字稿嗎？"; return draw(); }
    V.lines = lines; V.err = null; V.timed = lines.some(l => l.start != null); V.editing = false;
    V.more = false; V.auto = false;
    store(cacheKey(V.id), { title: V.title, lines: V.lines, timed: V.timed, more: false });
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
    if (V.auto && V.more && !V.loading && !V.err && V.lines.length && t > V.lines[V.lines.length - 1].start - 60) autoSubs();
    const i = V.lines.findIndex((l, k) => t >= l.start - 0.05 && t < (V.lines[k + 1] ? V.lines[k + 1].start : l.end + 1));
    if (i >= 0 && i !== cur && stopAt == null) { cur = i; highlight(true); drawBar(); }
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
    try { speechSynthesis.cancel(); } catch (e) {} App.stopAudio();
    cur = i; pausedAt = i; const l = V.lines[i];
    stopAt = l.end + 0.15;
    player.seekTo(Math.max(0, l.start - 0.1), true); player.playVideo();
    highlight(true); drawBar();
  }

  /* ---------- 錄音跟讀：底部固定一列「重播／跟讀／下一句」，結果開在獨立畫面 ---------- */
  let recState = "idle", recErr = null; // idle | listening | processing | error
  let det = null;                       // 結果畫面：{ i, result, hist, sel }
  let scores = {};                      // 句子 index -> 最近一次分數
  function playBlob(b, t0, t1) { try { player && player.pauseVideo(); } catch (e) {} App.playBlob(b, t0, t1); }
  function sel() { return cur >= 0 ? cur : 0; }
  function doRec() {
    if (!V || !V.lines.length) return;
    if (recState === "listening") { Azure.stop(); recState = "processing"; return drawBar(); }
    if (recState === "processing") return;
    const i = sel(), text = V.lines[i].text;
    try { player && player.pauseVideo(); speechSynthesis.cancel(); } catch (e) {}
    App.stopAudio(); stopAt = null; if (cur < 0) { cur = i; highlight(true); }
    recErr = null;
    if (App.isDemo()) {
      recState = "processing"; drawBar();
      return setTimeout(() => Azure.mock(text).then(r => { recState = "idle"; drawBar(); showDetail(i, r, []); }), 700);
    }
    recState = "listening"; drawBar();
    Azure.assess(text, st => { recState = st; drawBar(); })
      .then(async r => {
        App.record(r); await App.saveRec(r);
        const hist = await App.recsFor(text);
        scores[i] = r.scores.pron; recState = "idle"; drawBar(); drawLine(i);
        if (V) showDetail(i, r, hist);
      })
      .catch(e => { if (e.code === "aborted") { recState = "idle"; return drawBar(); } recState = "error"; recErr = e; drawBar(); });
  }
  function next() {
    if (!V || !V.lines.length) return;
    const i = Math.min(V.lines.length - 1, sel() + (cur < 0 ? 0 : 1));
    closeDetail(); playLine(i);
  }
  async function loadScores() {
    const v = V;
    for (let i = 0; i < v.lines.length; i++) {
      const h = await App.recsFor(v.lines[i].text);
      if (V !== v) return;
      if (h.length) { scores[i] = h[0].score; drawLine(i); }
    }
  }
  function origThenMine(i, audioBlob) {
    playLine(i);
    const l = V.lines[i], wait = l.start != null ? (l.end - l.start + 0.6) * 1000 / opt.rate : 400 * l.text.split(" ").length / opt.rate;
    setTimeout(() => playBlob(audioBlob), wait);
  }

  /* ---------- 結果畫面 ---------- */
  function showDetail(i, result, hist) { det = { i, result, hist, sel: null }; drawDetail(); }
  function closeDetail() { det = null; const d = $("#sdetail"); if (d) { d.hidden = true; d.innerHTML = ""; } App.stopAudio(); }
  function drawDetail() {
    const d = $("#sdetail"); if (!d || !det) return;
    const l = V.lines[det.i];
    d.innerHTML = `<div class="sh-top"><button class="x" data-dclose aria-label="回到影片">‹</button><b class="sh-title">第 ${det.i + 1} 句的結果</b></div>
      <div class="sh-body"><p class="res-ref">${esc(l.text)}</p>${App.resultView(det.result, det, { model: "原聲" })}</div>
      <div class="sh-bot"><button class="side" data-say="0">${IC.play}<span>原聲</span></button>
        <div><button class="mic" data-drec aria-label="再錄一次">${IC.mic.replace('width="18" height="18"', 'width="36" height="36"')}</button><div class="status">再錄一次</div></div>
        <button class="side" data-snext>${IC.next}<span>下一句</span></button></div>`;
    d.hidden = false; d.querySelector(".sh-body").scrollTop = 0;
  }

  /* ---------- 畫面 ---------- */
  function lineHtml(l, i) {
    const on = i === cur, sc = scores[i];
    return `<div class="ln${on ? " on" : ""}" id="ln${i}" data-li="${i}"><span class="ln-t">${l.start != null ? clock(l.start) : "第 " + (i + 1) + " 句"}${sc != null ? `<em class="badge ${cls(sc)}" data-open="${i}">${sc}</em>` : ""}</span><span class="ln-x">${esc(l.text)}</span></div>`;
  }
  function drawLine(i) { const el = document.getElementById("ln" + i); if (el && V) el.outerHTML = lineHtml(V.lines[i], i); }
  function highlight(scroll) {
    const box = $("#lines"); if (!box) return;
    box.querySelectorAll(".ln.on").forEach(el => { const k = +el.dataset.li; if (k !== cur) drawLine(k); });
    drawLine(cur);
    if (scroll) { const el = document.getElementById("ln" + cur); el && el.scrollIntoView({ block: "center", behavior: "smooth" }); }
  }
  function drawBar() {
    const b = $("#sbar"); if (!b || !V) return;
    const has = V.lines.length && !V.editing;
    b.hidden = !has;
    const micCls = recState === "listening" ? "on" : recState === "processing" ? "wait" : "";
    const status = recState === "listening" ? "正在聽…唸完按一下" : recState === "processing" ? "評分中…" : cur < 0 ? "先點一句，或直接跟讀第 1 句" : "跟讀這句";
    b.innerHTML = `${recState === "error" && recErr ? `<div class="sbar-err"><b>${esc(recErr.message)}</b>${recErr.code === "no_key" || recErr.code === "bad_key" ? `<span><button class="pill" data-sset>去設定</button><button class="pill" data-sdemo>先用示範模式</button></span>` : ""}</div>` : ""}
      <div class="sh-bot"><button class="side" data-replay>${IC.play}<span>重播</span></button>
        <div><button class="mic ${micCls}" data-srec aria-label="跟讀">${IC.mic.replace('width="18" height="18"', 'width="36" height="36"')}</button><div class="status">${status}</div></div>
        <button class="side" data-snext>${IC.next}<span>下一句</span></button></div>`;
  }
  function draw() {
    const box = $("#lines"); if (!box || !V) return;
    $("#shtitle").textContent = V.title || "影片跟讀";
    drawBar();
    if (!V.lines.length && V.loading) { box.innerHTML = `<div class="hint">正在自動產生逐句字幕，大約 20 到 60 秒…</div>`; return; }
    if (!V.lines.length || V.editing) {
      box.innerHTML = `<div class="paste">
        <h3>${V.err ? "自動產生沒有成功，改用手動貼" : "貼上這支影片的英文逐字稿"}</h3>
        ${V.err ? `<p class="err">${esc(V.err)}</p>` : ""}
        <ol class="steps"><li>在電腦或 iPad 打開這支 YouTube 影片</li><li>按影片說明下方的「顯示逐字稿」</li><li>全選逐字稿（含時間）複製，貼到下面</li></ol>
        <p class="mute">也可以貼 .srt 或 .vtt 字幕檔的內容。沒有時間點也能練，只是不能點句子跳到影片那一段。</p>
        <textarea id="tx" rows="8" placeholder="0:01&#10;Hi everyone, welcome back.&#10;0:04&#10;Today we're talking about..."></textarea>
        <div style="display:flex;gap:8px;margin-top:10px"><button class="big" data-txsave style="flex:1">產生逐句字幕</button>${V.lines.length ? `<button class="big secondary" data-txcancel style="flex:none;width:auto;padding:0 18px">取消</button>` : V.auto !== false && !location.hostname.endsWith("github.io") ? `<button class="big secondary" data-more style="flex:none;width:auto;padding:0 18px">再試自動</button>` : ""}</div>
      </div>`;
      return;
    }
    box.innerHTML = V.lines.map(lineHtml).join("") +
      (V.loading ? `<div class="hint">載入後面的字幕中…</div>` : V.auto && V.err ? `<div class="hint"><b class="err">${esc(V.err)}</b> <button class="pill" data-more>再試一次</button></div>` : V.auto && V.more ? `<button class="pill" data-more style="margin:12px auto;display:flex">載入後面 5 分鐘</button>` : "") +
      `<p class="mute" style="text-align:center;margin:14px 0">${V.timed ? "" : "這份逐字稿沒有時間點，點句子不會跳到影片。"}<button class="del" data-txedit>重新貼逐字稿</button></p>`;
  }
  function opts() {
    return `<button class="chip" data-sopt="rate" aria-pressed="${opt.rate < 1}">慢速 0.75×</button>
      <button class="chip" data-sopt="pause" aria-pressed="${opt.pause}">每句停</button>
      <button class="chip" data-sopt="loop" aria-pressed="${opt.loop}">${IC.loop} 循環這句</button>`;
  }

  function open(v) {
    const cached = load(cacheKey(v.id), null);
    V = { id: v.id, title: (cached && cached.title) || v.title || "", lines: cached && cached.lines || [], timed: cached ? cached.timed !== false : true, auto: !!(cached && cached.auto), more: cached ? cached.more !== false && !!cached.auto : true, next: cached && cached.next || 0, err: null, editing: false, loading: false };
    if (!V.title) fetch("https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v=" + v.id)).then(r => r.ok ? r.json() : null).then(j => { if (j && j.title && V && V.id === v.id) { V.title = j.title; $("#shtitle").textContent = j.title; window.dispatchEvent(new CustomEvent("shadow-title", { detail: { id: v.id, title: j.title } })); } }).catch(() => {});
    cur = -1; stopAt = null; pausedAt = -1; ready = false; scores = {}; det = null; recState = "idle"; recErr = null;
    const el = $("#shadow");
    el.innerHTML = `<div class="sh-top"><button class="x" data-sclose aria-label="關閉">×</button><b id="shtitle" class="sh-title"></b></div>
      <div class="sh-video"><div class="frame"><div id="yt"></div></div><div class="chips" id="sopts">${opts()}</div></div>
      <div class="sh-body" id="lines"></div>
      <div id="sbar" class="sbar"></div>
      <div id="sdetail" class="sheet sdetail" hidden></div>`;
    el.hidden = false; document.getElementById("tabs").hidden = true;
    draw(); mountPlayer(); loadScores();
    if (!V.lines.length) autoSubs();
  }
  function close() {
    clearInterval(tick); tick = null;
    try { player && player.destroy(); } catch (e) {}
    player = null; ready = false; Azure.cancel(); App.stopAudio(); V = null; det = null;
    $("#shadow").hidden = true; $("#shadow").innerHTML = ""; document.getElementById("tabs").hidden = false;
  }

  document.addEventListener("click", e => {
    if (!V) return;
    const t = e.target.closest("button,[data-li],[data-open]"); if (!t || !t.closest("#shadow")) return;
    const d = t.dataset;
    if ("sclose" in d) return close();
    if ("dclose" in d) return closeDetail();
    if ("txsave" in d) return saveTranscript();
    if ("txedit" in d) { V.editing = true; return draw(); }
    if ("more" in d) { V.err = null; V.more = true; V.editing = false; return autoSubs(); }
    if ("txcancel" in d) { V.editing = false; V.err = null; return draw(); }
    if (d.sopt) {
      if (d.sopt === "rate") { opt.rate = opt.rate < 1 ? 1 : .75; try { player.setPlaybackRate(opt.rate); } catch (e) {} }
      else opt[d.sopt] = !opt[d.sopt];
      store("shadow-opt", opt); $("#sopts").innerHTML = opts(); return;
    }
    if ("srec" in d) return doRec();
    if ("drec" in d) { const i = det.i; closeDetail(); cur = i; return doRec(); }
    if ("replay" in d) return playLine(sel());
    if ("snext" in d) return next();
    if ("sset" in d) { close(); return App.goSettings(); }
    if ("sdemo" in d) { App.setDemo(true); recState = "idle"; return doRec(); }
    if (d.open != null) { e.stopPropagation(); const i = +d.open; App.recsFor(V.lines[i].text).then(h => { if (h[0] && h[0].result) showDetail(i, { ...h[0].result, audio: h[0].audio }, h); }); return; }
    // 結果畫面裡的按鈕
    if (det) {
      const r = det.result;
      if (d.say != null) return playLine(det.i);
      if (d.sayw) return App.say(d.sayw, true);
      if ("mine" in d) return playBlob(r.audio);
      if ("ab" in d) return origThenMine(det.i, r.audio);
      if (d.mineword != null) { const w = r.words[+d.mineword]; return playBlob(r.audio, w.t0, w.t1); }
      if (d.rec != null) { const x = det.hist[+d.rec]; if (x && x.result) { det.result = { ...x.result, audio: x.audio }; det.sel = null; drawDetail(); } return playBlob(x && x.audio); }
      if (d.w != null) { det.sel = +d.w; return drawDetail(); }
    }
    // 點哪一句就播哪一句（已選的那句也會重播）
    if (d.li != null && t.tagName !== "BUTTON") return playLine(+d.li);
  });

  window.Shadow = { open, close };
})();
