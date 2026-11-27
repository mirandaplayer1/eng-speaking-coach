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

  let current = null;

  // 開始錄音並評分。onState("listening" | "processing")。說完停頓約 1.2 秒會自動結束。
  function assess(reference, onState) {
    return new Promise((resolve, reject) => {
      const creds = getCreds();
      if (!creds || !creds.key || !creds.region) return reject({ code: "no_key", message: "先到「設定」貼上 Azure 金鑰。" });
      if (!SDK) return reject({ code: "no_sdk", message: "語音元件沒有載入，重新整理頁面。" });
      let reco;
      try {
        const sc = SDK.SpeechConfig.fromSubscription(creds.key, creds.region);
        sc.speechRecognitionLanguage = "en-US";
        sc.setProperty(SDK.PropertyId.Speech_SegmentationSilenceTimeoutMs, "1200");
        const ac = SDK.AudioConfig.fromDefaultMicrophoneInput();
        const pac = new SDK.PronunciationAssessmentConfig(
          reference,
          SDK.PronunciationAssessmentGradingSystem.HundredMark,
          SDK.PronunciationAssessmentGranularity.Phoneme,
          true
        );
        pac.phonemeAlphabet = "IPA";
        pac.nbestPhonemeCount = 5;
        pac.enableProsodyAssessment = true;
        reco = new SDK.SpeechRecognizer(sc, ac);
        pac.applyTo(reco);
      } catch (e) {
        return reject({ code: "setup", message: "Azure 設定有誤：" + (e && e.message || e) });
      }
      current = reco;
      reco.sessionStarted = () => onState && onState("listening");
      reco.speechEndDetected = () => onState && onState("processing");
      reco.recognizeOnceAsync(
        result => {
          current = null;
          try { reco.close(); } catch (e) {}
          if (result.reason === SDK.ResultReason.Canceled) {
            const c = SDK.CancellationDetails.fromResult(result);
            const auth = /401|403|auth|subscription/i.test(c.errorDetails || "");
            return reject({ code: auth ? "bad_key" : "canceled", message: auth ? "金鑰或區域不對，到「設定」檢查一下。" : "連線中斷：" + (c.errorDetails || "請再試一次") });
          }
          if (result.reason === SDK.ResultReason.NoMatch) return reject({ code: "no_speech", message: "沒有聽到聲音，再靠近手機說一次。" });
          try {
            const raw = JSON.parse(result.properties.getProperty(SDK.PropertyId.SpeechServiceResponse_JsonResult));
            resolve(normalize(raw, reference));
          } catch (e) { reject(e.code ? e : { code: "parse", message: "看不懂 Azure 的回應，請再試一次。" }); }
        },
        err => {
          current = null;
          try { reco.close(); } catch (e) {}
          const mic = /permission|notallowed|microphone/i.test(String(err));
          reject({ code: mic ? "mic" : "error", message: mic ? "麥克風沒有被允許。到 iPhone 設定 › Safari › 麥克風 打開。" : "錄音失敗：" + err });
        }
      );
    });
  }

  function cancel() {
    if (current) { try { current.close(); } catch (e) {} current = null; }
  }

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

  window.Azure = { assess, cancel, mock, getCreds, setCreds };
})();
