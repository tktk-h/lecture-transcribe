import 'dotenv/config';
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

// 静的ファイル（index.html / style.css / script.js）を配信
app.use(express.static('.'));

// 音声を受け取り、OpenAIのWhisper APIに中継するエンドポイント
// （APIキーはサーバー側の.envにのみ存在し、ブラウザには渡らない）
app.post(
  '/transcribe',
  express.raw({ type: '*/*', limit: '50mb' }),
  async (req, res) => {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: 'サーバーにAPIキーが設定されていません（.envを確認してください）' });
    }
    try {
      const contentType = req.headers['content-type'] || 'audio/webm';
      const blob = new Blob([req.body], { type: contentType });

      const form = new FormData();
      form.append('file', blob, 'audio.webm');
      form.append('model', 'whisper-1');
      form.append('language', 'ja');
      // 句読点や文構造を整えるためのヒント
      form.append('prompt', 'これは日本語の大学の講義の録音です。');

      const apiRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: form,
      });

      const data = await apiRes.json();
      if (!apiRes.ok) {
        console.error('OpenAI APIエラー:', data);
        return res.status(apiRes.status).json({ error: data.error?.message || 'API呼び出しに失敗しました' });
      }
      res.json({ text: data.text });
    } catch (e) {
      console.error('サーバーエラー:', e);
      res.status(500).json({ error: e.message });
    }
  }
);

app.listen(PORT, () => {
  console.log(`\n✅ サーバー起動: http://localhost:${PORT}\n   ブラウザでこのURLを開いてください（Ctrl+C で停止）\n`);
});
