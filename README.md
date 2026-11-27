# ShadowLearn 口音教練

iPhone Safari 可用的英文發音練習工具。用 Azure Speech Pronunciation Assessment 做音素級評分，針對台灣人常見口音難點（TH、R/L、字尾子音、長短母音、V/W、重音語調）給中文練法與 YouTube 教學影片。

- `azure.js`：錄音與評分模組（自己擷取麥克風，同時送 Azure 並存成 WAV），不依賴 UI
- 錄音存在瀏覽器 IndexedDB，每句保留最近 10 次
- `data.js`：題庫、音素練法、影片搜尋詞
- `app.js` / `style.css`：介面
- `vendor/speech-sdk.min.js`：Microsoft Cognitive Services Speech SDK 1.40.0（MIT，見 `vendor/SPEECH-SDK-LICENSE`）

Azure 金鑰在「設定」頁輸入，只存在瀏覽器 localStorage，不會進到 repo。

## 影片跟讀（shadowing）
- `shadow.js`：YouTube 播放器 + 逐句字幕，點句重播、每句停、循環、慢速，跟讀後用那一句評分
- `supabase/functions/shadow/`：產生逐句字幕的 Edge Function（部署在 reader 專案，沿用 `GEMINI_API_KEY`，用 `SHADOW_PASS` 擋陌生人）
