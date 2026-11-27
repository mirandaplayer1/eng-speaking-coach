// 題庫、音素練法、影片。全部是靜態資料，改這個檔就能加題目。
window.CATS = [
  { id: "th", name: "TH", zh: "TH 音", color: "#ff6b4a", phon: ["θ", "ð"],
    what: "/θ/ /ð/ 常被說成 s、f、d、z（think→sink、they→day）。",
    sentences: [
      ["I think three of them are thirsty.", "/aɪ θɪŋk θriː əv ðəm ɑːr ˈθɝːsti/"],
      ["Thank you for thinking of me.", "/θæŋk juː fɚ ˈθɪŋkɪŋ əv miː/"],
      ["They gather together on Thursday.", "/ðeɪ ˈɡæðɚ təˈɡeðɚ ɑːn ˈθɝːzdeɪ/"],
      ["Is this the right path to the theater?", "/ɪz ðɪs ðə raɪt pæθ tə ðə ˈθiːətɚ/"],
      ["My mother has three brothers.", "/maɪ ˈmʌðɚ hæz θriː ˈbrʌðɚz/"]
    ],
    words: ["think", "sink", "three", "free", "thank", "tank", "mouth", "mouse", "they", "day"],
    videos: [
      ["TH 音的舌頭位置（Rachel's English）", "rachel's english th sound"],
      ["TH 無聲與有聲的差別", "th sound voiced voiceless pronunciation"],
      ["think vs sink 最小對立練習", "think sink minimal pairs th s"]
    ] },
  { id: "rl", name: "R/L", zh: "R 與 L", color: "#2f80ff", phon: ["ɹ", "r", "l"],
    what: "R 捲不出來或變 L/W；字尾 L 被吞掉（feel 聽起來像 fee）。",
    sentences: [
      ["I really like the light blue color.", "/aɪ ˈriːəli laɪk ðə laɪt bluː ˈkʌlɚ/"],
      ["Please read the list from left to right.", "/pliːz riːd ðə lɪst frəm left tə raɪt/"],
      ["The road was long and rainy.", "/ðə roʊd wəz lɔːŋ ənd ˈreɪni/"],
      ["I feel a little tired.", "/aɪ fiːl ə ˈlɪtl̩ taɪɚd/"],
      ["Will you call me later?", "/wɪl juː kɔːl miː ˈleɪtɚ/"]
    ],
    words: ["right", "light", "read", "lead", "rice", "lice", "grass", "glass", "feel", "world"],
    videos: [
      ["R 和 L 的發音差別", "r vs l pronunciation english"],
      ["美式 R 怎麼發（Rachel's English）", "rachel's english r sound"],
      ["字尾 dark L（feel, call）", "dark l sound pronunciation"]
    ] },
  { id: "fin", name: "尾音", zh: "字尾子音", color: "#00a87e", phon: [],
    what: "字尾 t/d/k/g/s/z 被省略，或多加一個「ㄜ」（bike→buy、good→goo-de）。",
    sentences: [
      ["I need a cup of black coffee.", "/aɪ niːd ə kʌp əv blæk ˈkɔːfi/"],
      ["She asked me to send it back.", "/ʃiː æskt miː tə send ɪt bæk/"],
      ["Could you check the date?", "/kʊd juː tʃek ðə deɪt/"],
      ["My job is to help them build it.", "/maɪ dʒɑːb ɪz tə help ðəm bɪld ɪt/"],
      ["I can't find my phone.", "/aɪ kænt faɪnd maɪ foʊn/"]
    ],
    words: ["bike", "road", "make", "seed", "seat", "bag", "back", "asked", "world", "months"],
    videos: [
      ["字尾 t/d/k 不爆破但要做到位", "final consonants stop sounds english pronunciation"],
      ["不要在字尾加母音", "don't add vowel end of words english pronunciation"],
      ["-ed 結尾三種唸法", "ed endings pronunciation t d id"]
    ] },
  { id: "vow", name: "母音", zh: "長短母音", color: "#a35cff", phon: ["ɪ", "i", "æ", "ɛ", "ʊ", "u"],
    what: "ɪ/iː（ship/sheep）、ʊ/uː（full/fool）、æ/ɛ（bad/bed）混在一起。",
    sentences: [
      ["Can I sit in this seat?", "/kən aɪ sɪt ɪn ðɪs siːt/"],
      ["The ship carried sheep.", "/ðə ʃɪp ˈkærid ʃiːp/"],
      ["Pull the door, don't push it.", "/pʊl ðə dɔːr doʊnt pʊʃ ɪt/"],
      ["I left my bag on the bed.", "/aɪ left maɪ bæɡ ɑːn ðə bed/"],
      ["Please fill in this form if you feel sick.", "/pliːz fɪl ɪn ðɪs fɔːrm ɪf juː fiːl sɪk/"]
    ],
    words: ["ship", "sheep", "live", "leave", "full", "fool", "bad", "bed", "man", "men"],
    videos: [
      ["ship vs sheep 長短母音", "ship sheep short long i minimal pairs"],
      ["/æ/ 和 /ɛ/：bad 和 bed", "ae vs e bad bed pronunciation"],
      ["full vs fool", "full fool pull pool vowel pronunciation"]
    ] },
  { id: "vw", name: "V/W", zh: "V 與 W", color: "#ffb020", phon: ["v", "w"],
    what: "V 說成 W 或 B（very→wery/berry、vest→west）。",
    sentences: [
      ["We have very good wine.", "/wiː hæv ˈveri ɡʊd waɪn/"],
      ["Vivian visits the village every week.", "/ˈvɪviən ˈvɪzɪts ðə ˈvɪlɪdʒ ˈevri wiːk/"],
      ["I want a vanilla latte.", "/aɪ wɑːnt ə vəˈnɪlə ˈlɑːteɪ/"],
      ["The view was wonderful.", "/ðə vjuː wəz ˈwʌndɚfəl/"],
      ["Have you ever voted?", "/hæv juː ˈevɚ ˈvoʊtɪd/"]
    ],
    words: ["vest", "west", "vine", "wine", "very", "berry", "vote", "boat", "van", "fan"],
    videos: [
      ["V 和 W 的嘴型", "v vs w pronunciation"],
      ["V 和 B：very vs berry", "v vs b pronunciation very berry"]
    ] },
  { id: "st", name: "重音", zh: "重音語調", color: "#ff4f9a", phon: [],
    what: "中文每個字一樣重，英文要有輕重；重音放錯會讓人聽不懂（phoTOgraphy）。",
    sentences: [
      ["I'd love to, but I'm busy tonight.", "I'd LOVE to, but I'm BUsy toNIGHT."],
      ["Could you send me the report by Friday?", "Could you SEND me the rePORT by FRIday?"],
      ["Are you coming to the party?", "Are you COMing to the PARty? ↗"],
      ["I've been working on a new project.", "I've been WORKing on a new PROject."],
      ["We help small teams find answers faster.", "We HELP small TEAMS find ANswers FASter."]
    ],
    words: ["photograph", "photography", "comfortable", "develop", "vegetable", "hotel", "event", "record"],
    videos: [
      ["英文句子重音與節奏", "sentence stress rhythm english pronunciation"],
      ["名詞動詞重音不同（PROject / proJECT）", "noun verb stress shift record project"],
      ["語調：問句上揚與下降", "english intonation questions rising falling"]
    ] }
];

// 情境：投資人、社交等，給她真的會講的句子
window.SCENES = [
  "Hi, I'm Miranda. I'm the founder of a small software company.",
  "Our product helps teams find answers in their own files.",
  "Could we schedule a quick call next Thursday?",
  "That's a really good question. Let me think about it.",
  "Can I get a medium iced latte with oat milk, please?"
];

// 音素練法（Azure 回傳 IPA）
window.TIPS = {
  "θ": { n: "TH（無聲）", cat: "th", how: "舌尖輕放上下門牙之間，只吐氣、喉嚨不震動。先咬著舌頭發「th—」兩秒，再接母音。" },
  "ð": { n: "TH（有聲）", cat: "th", how: "舌頭位置跟 θ 一樣在齒間，但喉嚨要震動，摸喉嚨會麻。the、this、they 都是這個音。" },
  "ɹ": { n: "R", cat: "rl", how: "舌尖不碰任何地方，往後縮；嘴唇微圓往前嘟。像「ㄖ」但舌頭更後面、更緊。" },
  "r": { n: "R", cat: "rl", how: "舌尖不碰任何地方，往後縮；嘴唇微圓往前嘟。像「ㄖ」但舌頭更後面、更緊。" },
  "l": { n: "L", cat: "rl", how: "舌尖頂住上排牙齒後方的牙齦。字尾 L（feel、call）舌尖也要頂到，停一下再放。" },
  "v": { n: "V", cat: "vw", how: "上排牙齒輕碰下唇內側，吹氣並震動喉嚨，下唇會發麻。不是嘴唇圓起來的 W。" },
  "w": { n: "W", cat: "vw", how: "嘴唇圓起來往前嘟，牙齒不碰嘴唇，然後快速放開。" },
  "ɪ": { n: "短 i（ship）", cat: "vow", how: "嘴角放鬆、舌頭稍低，短促。介於「一」和「ㄝ」之間，不要拉長。" },
  "i": { n: "長 iː（sheep）", cat: "vow", how: "嘴角往兩邊拉開像微笑，舌頭高、緊，拉長一點。" },
  "æ": { n: "æ（bad）", cat: "vow", how: "嘴巴張大、下巴往下，嘴角往兩側。介於「ㄚ」和「ㄝ」之間，比 ɛ 張更大。" },
  "ɛ": { n: "ɛ（bed）", cat: "vow", how: "嘴巴半開，像「ㄝ」，比 æ 小，短促。" },
  "ʊ": { n: "短 u（full）", cat: "vow", how: "嘴唇微圓但放鬆，短促，舌頭不要太高。" },
  "u": { n: "長 uː（fool）", cat: "vow", how: "嘴唇嘟圓、拉長，像「ㄨ」再更圓。" },
  "z": { n: "Z", cat: "fin", how: "跟 s 一樣的位置，但喉嚨要震動，像蜜蜂嗡嗡。字尾 -s 很多其實是 z（is、has、dogs）。" },
  "ʃ": { n: "SH", cat: null, how: "嘴唇往前嘟，舌頭往後放，送氣。比中文「ㄒ」更圓、更後面。" },
  "ʒ": { n: "ZH（vision）", cat: null, how: "跟 sh 同位置但喉嚨震動。" },
  "ŋ": { n: "NG", cat: "fin", how: "舌根頂住軟顎，聲音從鼻子出來，不要接 g 或「ㄜ」。" },
  "n": { n: "N", cat: "fin", how: "舌尖頂住上齒齦，字尾 n 要頂住，不要變成 ng。" },
  "ɝ": { n: "ER（bird）", cat: "rl", how: "舌頭往後捲、嘴唇微圓，整個音都帶 R 色彩。" },
  "ɚ": { n: "弱 ER（teacher）", cat: "rl", how: "輕輕帶過的 R 音，舌頭仍要往後捲一點。" },
  "oʊ": { n: "OU（go）", cat: "vow", how: "從「ㄛ」滑到「ㄨ」，嘴唇要動，不是單一個「ㄡ」。" },
  "eɪ": { n: "EI（day）", cat: "vow", how: "從「ㄝ」滑到「一」，嘴巴要有移動。" },
  "ə": { n: "弱音 ə", cat: "st", how: "非重音節的母音，輕、短、放鬆，像輕輕的「ㄜ」。重音以外的音節大多是它。" },
  "s": { n: "S", cat: "fin", how: "舌尖靠近上齒齦，送出嘶聲。字尾 s 要清楚、拉長一點。" },
  "t": { n: "T", cat: "fin", how: "舌尖頂上齒齦。字尾 t 可以不爆破，但舌頭一定要頂到再停住。" },
  "d": { n: "D", cat: "fin", how: "跟 t 同位置但有聲。字尾 d 不要加「ㄜ」，頂住就停。" },
  "k": { n: "K", cat: "fin", how: "舌根頂住軟顎。字尾 k 要做到位，不然 bike 會變 buy。" },
  "g": { n: "G", cat: "fin", how: "跟 k 同位置但有聲。" },
  "ɡ": { n: "G", cat: "fin", how: "跟 k 同位置但有聲。" },
  "p": { n: "P", cat: "fin", how: "雙唇閉緊。字尾 p 嘴唇要真的閉起來。" },
  "b": { n: "B", cat: "fin", how: "雙唇閉緊、有聲。" },
  "f": { n: "F", cat: "vw", how: "上齒碰下唇，只吹氣不震動。" }
};

// NBest 聽起來像哪個音時，用注音幫助理解
window.ZHUYIN = { s: "ㄙ", f: "ㄈ", d: "ㄉ", t: "ㄊ", z: "ㄗ的有聲版", l: "ㄌ", w: "ㄨ", b: "ㄅ", i: "一", "ɛ": "ㄝ", u: "ㄨ", "ɑ": "ㄚ", "ʌ": "ㄜ", n: "ㄋ", "ɹ": "R", v: "V", "θ": "TH", "ð": "TH", "ə": "ㄜ" };
