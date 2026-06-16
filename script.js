// ===== DOM要素 =====
const micBtn = document.getElementById('micBtn');
const micLabel = document.getElementById('micLabel');
const copyBtn = document.getElementById('copyBtn');
const saveBtn = document.getElementById('saveBtn');
const saveAudioBtn = document.getElementById('saveAudioBtn');
const chatgptBtn = document.getElementById('chatgptBtn');
const geminiBtn = document.getElementById('geminiBtn');
const clearBtn = document.getElementById('clearBtn');
const themeToggle = document.getElementById('themeToggle');
const transcriptEl = document.getElementById('transcript');
const statusEl = document.getElementById('status');
const finalTextEl = document.getElementById('finalText');
const interimTextEl = document.getElementById('interimText');

// ===== テーマ切り替え =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem('theme', theme);
}
applyTheme(localStorage.getItem('theme') || 'light');
themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// ===== 状態 =====
let finalTranscript = '';
let isRecording = false;
let stream = null;
let recorder = null;
let recordedChunks = [];
let lastAudioBlob = null;   // 直近の録音音声（再保存用に保持）

// ===== 任意のBlobをファイルとしてダウンロード保存 =====
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ===== 日時入りのファイル名を作る =====
function timestampName(prefix, ext) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${prefix}_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.${ext}`;
}

// ===== 録音音声をローカルに保存（拡張子は録音形式に合わせる） =====
function saveAudio(blob) {
  if (!blob) return;
  const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
  downloadBlob(blob, timestampName('講義録音', ext));
}

// ===== 録音した音声をサーバー(/transcribe)へ送って文字起こし =====
async function transcribeRecording() {
  if (recordedChunks.length === 0) {
    statusEl.textContent = '音声が録音されていませんでした';
    return;
  }
  try {
    const blob = lastAudioBlob || new Blob(recordedChunks, { type: recorder?.mimeType || 'audio/webm' });
    statusEl.textContent = '☁️ 文字起こし中…（サーバー経由でWhisper APIに送信しています）';

    const res = await fetch('/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': blob.type },
      body: blob,
    });
    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = `エラー: ${data.error || '文字起こしに失敗しました'}（録音音声は保存済みです）`;
      return;
    }

    const text = (data.text || '').trim();
    if (text) {
      if (finalTranscript && !finalTranscript.endsWith('\n')) finalTranscript += '\n';
      finalTranscript += text;
      finalTextEl.textContent = finalTranscript;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
      statusEl.textContent = '✅ 文字起こし完了';
    } else {
      statusEl.textContent = '文字起こし結果が空でした（音量やマイクをご確認ください）';
    }
  } catch (e) {
    console.error('送信エラー:', e);
    statusEl.textContent = `エラー: サーバーに接続できません。録音音声は保存済みなので、ネット復帰後に「録音音声を保存」から再利用できます（${e.message}）`;
  }
}

// ===== 開始（録音するだけ。文字起こしは停止後） =====
// ===== マイクボタン（タップで録音⇄停止をトグル） =====
async function startRecording() {
  try {
    // iOS/Safari対策：マイク起動はボタン操作の延長で実行
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    console.error('マイク取得失敗:', e);
    statusEl.textContent = 'マイクを利用できません。ブラウザの許可設定を確認してください。';
    return;
  }

  recordedChunks = [];
  // ビットレートを抑えてファイルサイズを小さく保つ（Whisper APIは1ファイル25MBまで）
  try {
    recorder = new MediaRecorder(stream, { audioBitsPerSecond: 32000 });
  } catch (e) {
    recorder = new MediaRecorder(stream);
  }
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) recordedChunks.push(e.data);
  };
  recorder.onstop = async () => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }

    // ★まず録音音声をローカルに自動保存（ネット切断時でも音声を失わないため）
    if (recordedChunks.length > 0) {
      lastAudioBlob = new Blob(recordedChunks, { type: recorder?.mimeType || 'audio/webm' });
      saveAudio(lastAudioBlob);
      saveAudioBtn.disabled = false;
    }

    await transcribeRecording();
    // 変換が終わったらボタンを録音可能状態に戻す
    micBtn.disabled = false;
  };

  isRecording = true;
  micBtn.classList.add('recording');
  micLabel.textContent = 'タップして停止';
  if (interimTextEl) interimTextEl.textContent = '';
  statusEl.textContent = '🔴 録音中…（もう一度タップするとまとめて文字起こしします）';
  recorder.start();
}

function stopRecording() {
  isRecording = false;
  micBtn.classList.remove('recording');
  micLabel.textContent = 'タップして録音開始';
  // 変換が終わるまでボタンを無効化（二度押し防止）
  micBtn.disabled = true;
  statusEl.textContent = '⏳ 録音を停止しました。文字起こしを開始します…';
  if (recorder && recorder.state !== 'inactive') recorder.stop();
}

micBtn.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

// ===== コピー =====
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(finalTranscript);
    const original = copyBtn.textContent;
    copyBtn.textContent = '✅ コピーしました';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  } catch (err) {
    const range = document.createRange();
    range.selectNode(finalTextEl);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    document.execCommand('copy');
    window.getSelection().removeAllRanges();
  }
});

// ===== 保存（.txt） =====
saveBtn.addEventListener('click', () => {
  const blob = new Blob([finalTranscript], { type: 'text/plain;charset=utf-8' });
  downloadBlob(blob, timestampName('講義ノート', 'txt'));
});

// ===== 録音音声を（再）保存 =====
saveAudioBtn.addEventListener('click', () => {
  if (!lastAudioBlob) {
    alert('保存できる録音がまだありません。先に録音してください。');
    return;
  }
  saveAudio(lastAudioBlob);
});

// ===== AI校正依頼 =====
function buildProofreadPrompt() {
  return `【校正依頼】
以下の文章は講義の文字起こしデータです。
1. 文脈に基づき、誤字脱字や明らかな聞き間違いを修正して文章を整えてください。
2. ノート形式（見出しや箇条書きへの変換など）にはせず、文字起こしとしての文章構成のまま整えてください。
3. 出力結果は「文章ファイル形式（.txt）」でまとめてください。

【文字起こしデータ】
${finalTranscript}`;
}

chatgptBtn.addEventListener('click', () => {
  const prompt = encodeURIComponent(buildProofreadPrompt());
  window.open(`https://chat.openai.com/?q=${prompt}`, '_blank');
});

geminiBtn.addEventListener('click', async () => {
  const prompt = buildProofreadPrompt();
  try {
    await navigator.clipboard.writeText(prompt);
    alert('校正依頼の文章をコピーしました。Geminiの入力欄に貼り付け（Ctrl+V / Cmd+V）して送信してください。');
  } catch (err) {
    alert('クリップボードへのコピーに失敗しました。お手数ですが手動でコピーしてください。');
  }
  window.open('https://gemini.google.com/app', '_blank');
});

// ===== クリア =====
clearBtn.addEventListener('click', () => {
  if (!window.confirm('本当にすべての文章を削除しますか？')) return;
  finalTranscript = '';
  finalTextEl.textContent = '';
  if (interimTextEl) interimTextEl.textContent = '';
});
