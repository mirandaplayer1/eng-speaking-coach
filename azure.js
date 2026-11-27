// Azure Pronunciation Assessment：錄音 → 音素級評分。
// 不依賴 UI，可以單獨搬進其他專案。金鑰只存在使用者自己的瀏覽器（localStorage）。
(function () {
  const SDK = window.SpeechSDK;

  function getCreds() {
    try { return JSON.parse(localStorage.getItem("azure-creds") || "null"); } catch (e) { return null; }
  }
  function setCreds(c) {
    try { c ? localStorage.setItem("azure-creds", JSON.stringify(c)) : localStorage.removeItem("azure-creds"); } catch (e) {}
  }

  // 回傳 { scores:{pron,acc,flu,comp,pros}, words:[{w, score, err, phon:[{p, score, nbest:[{p,score}]}]}], heard, raw }
  function normalize(json, reference) {
    const nb = json && json.NBest && json.NBest[0];
    if (!nb) throw { code: "no_speech", message: "沒有聽到聲音，再靠近手機說一次。" };
    const pa = nb.PronunciationAssessment || {};
    const words = (nb.Words || []).map(w => {
      const wp = w.PronunciationAssessment || {};
      return {
        w: w.Word,
        t0: w.Offset != null ? w.Offset / 1e7 : null,
        t1: w.Offset != null ? (w.Offset + w.Duration) / 1e7 : null,
        score: Math.round(wp.AccuracyScore ?? 0),
        err: wp.ErrorType || "None",
        prosody: wp.Feedback && wp.Feedback.Prosody,
        phon: (w.Phonemes || []).map(p => {
          const pp = p.PronunciationAssessment || {};
          return {
            p: p.Phoneme,
            score: Math.round(pp.AccuracyScore ?? 0),
            nbest: (pp.NBestPhonemes || []).map(n => ({ p: n.Phoneme, score: Math.round(n.Score) }))
          };
        })
      };
    });
    return {
      reference,
      heard: nb.Display || json.DisplayText || "",
      scores: {
        pron: Math.round(pa.PronScore ?? 0),
        acc: Math.round(pa.AccuracyScore ?? 0),
        flu: Math.round(pa.FluencyScore ?? 0),
        comp: Math.round(pa.CompletenessScore ?? 0),
        pros: pa.ProsodyScore != null ? Math.round(pa.ProsodyScore) : null
      },
      words
    };
  }

  let current = null; // {reco, push, stop}

  // 自己擷取麥克風：同一份聲音一邊送 Azure 評分，一邊存成 WAV 給你回放。
  async function openMic() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC(); // 在點擊當下建立，iOS 才允許播放與錄音
    try { await ctx.resume(); } catch (e) {}
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    const ratio = ctx.sampleRate / 16000, chunks = [];
    let onPcm = null;
    proc.onaudioprocess = ev => {
      const x = ev.inputBuffer.getChannelData(0), n = Math.floor(x.length / ratio), out = new Int16Array(n);
      for (let i = 0; i < n; i++) {
        const st = Math.floor(i * ratio), en = Math.min(x.length, Math.floor((i + 1) * ratio));
        let sum = 0; for (let j = st; j < en; j++) sum += x[j];
        const v = Math.max(-1, Math.min(1, sum / Math.max(1, en - st)));
        out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      chunks.push(out);
      if (onPcm) onPcm(out.buffer);
    };
    src.connect(proc); proc.connect(ctx.destination);
    let closed = false;
    function close() {
      if (closed) return; closed = true;
      try { proc.disconnect(); src.disconnect(); } catch (e) {}
      stream.getTracks().forEach(t => t.stop());
      try { ctx.close(); } catch (e) {}
    }
    return { chunks, close, set onPcm(f) { onPcm = f; } };
  }

  function toWav(chunks) {
    const len = chunks.reduce((a, c) => a + c.length, 0), buf = new ArrayBuffer(44 + len * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, "RIFF"); v.setUint32(4, 36 + len * 2, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 16000, true); v.setUint32(28, 32000, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, "data"); v.setUint32(40, len * 2, true);
    let o = 44; chunks.forEach(c => { for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, c[i], true); });
    return new Blob([buf], { type: "audio/wav" });
  }

  // 開始錄音並評分。onState("listening" | "processing")。說完停頓約 2 秒會自動結束。
  // 回傳評分結果，另外帶 audio（WAV Blob）讓你回放。
  async function assess(reference, onState) {
    const creds = getCreds();
    if (!creds || !creds.key || !creds.region) throw { code: "no_key", message: "先到「設定」貼上 Azure 金鑰。" };
    if (!SDK) throw { code: "no_sdk", message: "語音元件沒有載入，重新整理頁面。" };
    let mic;
    try { mic = await openMic(); }
    catch (e) { throw { code: "mic", message: "麥克風沒有被允許。到 iPhone 設定 › Safari › 麥克風 打開，再重新整理。" }; }
    return new Promise((resolve, reject) => {
      let reco, push;
      try {
        const sc = SDK.SpeechConfig.fromSubscription(creds.key, creds.region);
        sc.speechRecognitionLanguage = "en-US";
        sc.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, "2000");
        push = SDK.AudioInputStream.createPushStream(SDK.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
        const ac = SDK.AudioConfig.fromStreamInput(push);
        const pac = new SDK.PronunciationAssessmentConfig(reference, SDK.PronunciationAssessmentGradingSystem.HundredMark, SDK.PronunciationAssessmentGranularity.Phoneme, true);
        pac.phonemeAlphabet = "IPA";
        pac.nbestPhonemeCount = 5;
        pac.enableProsodyAssessment = true;
        reco = new SDK.SpeechRecognizer(sc, ac);
        pac.applyTo(reco);
      } catch (e) {
        mic.close();
        return reject({ code: "setup", message: "Azure 設定有誤：" + (e && e.message || e) });
      }
      mic.onPcm = b => { try { push.write(b); } catch (e) {} };
      const finish = () => { mic.onPcm = null; mic.close(); try { push.close(); } catch (e) {} current = null; try { reco.close(); } catch (e) {} };
      current = { stop: () => { mic.onPcm = null; try { push.close(); } catch (e) {} }, abort: () => { finish(); reject({ code: "aborted", message: "已取消" }); } };
      onState && onState("listening");
      reco.speechEndDetected = () => { onState && onState("processing"); mic.onPcm = null; };
      reco.recognizeOnceAsync(
        result => {
          const audio = toWav(mic.chunks);
          finish();
          if (result.reason === SDK.ResultReason.Canceled) {
            const c = SDK.CancellationDetails.fromResult(result);
            const auth = /401|403|auth|subscription/i.test(c.errorDetails || "");
            return reject({ code: auth ? "bad_key" : "canceled", message: auth ? "金鑰或區域不對，到「設定」檢查一下。" : "連線中斷：" + (c.errorDetails || "請再試一次") });
          }
          if (result.reason === SDK.ResultReason.NoMatch) return reject({ code: "no_speech", message: "沒有聽到聲音，再靠近手機說一次。" });
          try {
            const raw = JSON.parse(result.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult));
            const r = normalize(raw, reference); r.audio = audio; resolve(r);
          } catch (e) { reject(e.code ? e : { code: "parse", message: "看不懂 Azure 的回應，請再試一次。" }); }
        },
        err => { finish(); reject({ code: "error", message: "錄音失敗：" + err }); }
      );
    });
  }

  // 使用者按停止：送出目前的聲音去評分
  function stop() { if (current) current.stop(); }
  function cancel() { if (current) current.abort(); }

  // 示範用：沒有金鑰時產生一份逼真的結果，讓介面可以先試。
  function mock(reference) {
    const P = { the: ["ð", "ə"], this: ["ð", "ɪ", "s"], think: ["θ", "ɪ", "ŋ", "k"], three: ["θ", "ɹ", "i"], thirsty: ["θ", "ɝ", "s", "t", "i"], of: ["ə", "v"], them: ["ð", "ɛ", "m"], are: ["ɑ", "ɹ"], i: ["a", "ɪ"] };
    let seed = reference.length * 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const guess = w => P[w] || w.replace(/[^a-z]/g, "").split("").slice(0, 5).map(c => ({ a: "æ", e: "ɛ", i: "ɪ", o: "ɑ", u: "ʌ", y: "i", r: "ɹ", c: "k", x: "k", q: "k", j: "dʒ" }[c] || c));
    const words = reference.replace(/[^A-Za-z' ]/g, "").split(/\s+/).filter(Boolean).map(W => {
      const w = W.toLowerCase();
      const phon = guess(w).map(p => {
        let s = 78 + Math.round(rnd() * 22), nb = [];
        if (p === "θ") { s = 34; nb = [{ p: "s", score: 88 }, { p: "θ", score: 34 }, { p: "f", score: 20 }]; }
        else if (p === "ð") { s = 52; nb = [{ p: "d", score: 76 }, { p: "ð", score: 52 }]; }
        else if (p === "ɹ" && rnd() < .5) { s = 58; nb = [{ p: "l", score: 70 }, { p: "ɹ", score: 58 }]; }
        return { p, score: s, nbest: nb.length ? nb : [{ p, score: s }] };
      });
      const score = Math.round(phon.reduce((a, b) => a + b.score, 0) / phon.length);
      return { w: W, score, err: score < 60 ? "Mispronunciation" : "None", phon };
    });
    const acc = Math.round(words.reduce((a, b) => a + b.score, 0) / words.length);
    return Promise.resolve({ reference, heard: reference, demo: true, words, scores: { pron: acc - 3, acc, flu: 84, comp: 100, pros: 71 } });
  }

  window.Azure = { assess, stop, cancel, mock, getCreds, setCreds, _openMic: openMic, _toWav: toWav };
})();
