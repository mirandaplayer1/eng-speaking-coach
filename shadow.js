// Shadowing：YouTube 影片 + 逐句字幕。點一句重播那一句，錄自己跟讀，Azure 用那一句當標準評分。
// 字幕由 Supabase 函式 shadow 產生（Gemini 轉寫，含每句起訖秒數），存在這台手機，同一支影片不會重抓。
(function () {
  const FN = "https://azgtjxznqdppistljerl.supabase.co/functions/v1/shadow";
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

  let V = null;      // { id, title, lines, more, next, loading, err }
  let player = null, ready = false, tick = null;
  let cur = -1;      // 現在這一句
  let stopAt = null; // 播到這裡暫停
  let pausedAt = -1;
  let opt = load("shadow-opt", { rate: 1, loop: false, pause: true });
  let rec = {};      // line index -> { state, result, err }
  const audio = new Audio(); let aurl = null;

  /* ---------- 字幕 ---------- */
  const cacheKey = id => "shadow-" + id;
  async function fetchChunk() {
    const v = V;
    if (!v || v.loading || v.more === false) return;
    const pass = load("shadow-pass", "");
    if (!pass) { v.err = "先到「設定」填字幕通行碼。"; draw(); return; }
    v.loading = true; v.err = null; draw();
    try {
      const r = await fetch(FN, { method: "POST", headers: { "content-type": "application/json", "x-shadow-pass": pass }, body: JSON.stringify({ url: v.id, from: v.next || 0 }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "字幕產生失敗（" + r.status + "）");
      if (j.title) v.title = j.title;
      const last = v.lines.length ? v.lines[v.lines.length - 1].start : -1;
      v.lines = v.lines.concat((j.lines || []).filter(l => l.start > last + 0.5));
      v.more = !!j.more; v.next = j.to;
      store(cacheKey(v.id), { title: v.title, lines: v.lines, more: v.more, next: v.next });
      window.dispatchEvent(new CustomEvent("shadow-title", { detail: { id: v.id, title: v.title } }));
    } catch (e) { v.err = e.message || "字幕產生失敗"; }
    v.loading = false;
    if (V === v) draw();
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
    const i = V.lines.findIndex((l, k) => t >= l.start - 0.05 && t < (V.lines[k + 1] ? V.lines[k + 1].start : l.end + 1));
    if (i >= 0 && i !== cur && stopAt == null) { cur = i; highlight(true); }
    // 自動暫停：連續播放時，每句播完停下來讓你跟讀（同一句只停一次）
    if (opt.pause && stopAt == null && cur >= 0 && pausedAt !== cur && player.getPlayerState() === 1 && t >= V.lines[cur].end) { pausedAt = cur; player.pauseVideo(); }
    if (V.more && !V.loading && V.lines.length && t > V.lines[V.lines.length - 1].start - 60) fetchChunk();
  }
  function playLine(i) {
    if (!ready || !V.lines[i]) return;
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
    const l = V.lines[i], wait = (l.end - l.start + 0.6) * 1000 / opt.rate;
    setTimeout(() => playBlob(r.result.audio), wait);
  }

  /* ---------- 畫面 ---------- */
  function lineHtml(l, i) {
    const r = rec[i] || {}, on = i === cur;
    let body = `<span class="ln-t">${clock(l.start)}</span><span class="ln-x">${esc(l.text)}</span>`;
    if (r.result) {
      body = `<span class="ln-t">${clock(l.start)}</span><span class="ln-x">${r.result.words.map(w => `<b class="${w.err === "Omission" ? "b" : cls(w.score)}">${esc(w.w)}</b>`).join(" ")}</span>`;
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
    if (!V.lines.length) {
      box.innerHTML = V.loading ? `<div class="hint">正在產生逐句字幕，大約 20 到 60 秒…</div>`
        : V.err ? `<div class="hint"><b class="err">${esc(V.err)}</b><br><button class="pill" data-retry style="margin-top:10px">再試一次</button></div>`
        : `<div class="hint">沒有字幕。</div>`;
      return;
    }
    box.innerHTML = V.lines.map(lineHtml).join("") +
      (V.loading ? `<div class="hint">載入後面的字幕中…</div>` : V.err ? `<div class="hint"><b class="err">${esc(V.err)}</b> <button class="pill" data-retry>再試一次</button></div>` : V.more ? `<button class="pill" data-retry style="margin:12px auto;display:flex">載入後面 5 分鐘</button>` : "");
  }
  function opts() {
    return `<button class="chip" data-sopt="rate" aria-pressed="${opt.rate < 1}">慢速 0.75×</button>
      <button class="chip" data-sopt="pause" aria-pressed="${opt.pause}">每句停</button>
      <button class="chip" data-sopt="loop" aria-pressed="${opt.loop}">${IC.loop} 循環這句</button>`;
  }

  function open(v) {
    const cached = load(cacheKey(v.id), null);
    V = { id: v.id, title: (cached && cached.title) || v.title || "", lines: cached ? cached.lines : [], more: cached ? cached.more : true, next: cached ? cached.next : 0, loading: false, err: null };
    cur = -1; stopAt = null; pausedAt = -1; rec = {}; ready = false;
    const el = $("#shadow");
    el.innerHTML = `<div class="sh-top"><button class="x" data-sclose aria-label="關閉">×</button><b id="shtitle" class="sh-title"></b></div>
      <div class="sh-video"><div class="frame"><div id="yt"></div></div><div class="chips" id="sopts">${opts()}</div></div>
      <div class="sh-body" id="lines"></div>`;
    el.hidden = false; document.getElementById("tabs").hidden = true;
    draw(); mountPlayer();
    if (!V.lines.length) fetchChunk();
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
    if ("retry" in d) { V.err = null; return fetchChunk(); }
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
