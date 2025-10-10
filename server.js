const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const bodyParser = require("body-parser");
const qrcode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// 📌 データファイルの読み書き
const dataFile = path.join(__dirname, "data.json");
function readData() {
  if (!fs.existsSync(dataFile)) {
    return {
      currentNumber: 0,
      distributed: [],
      checkedIn: 0,
      checkedOut: 0,
      maxCapacity: 20,
      callNumber: 0,
      skipped: [],
    };
  }
  return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
}
function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf-8");
}

// 📝 管理者画面（admin/admin）での最大人数設定、整理券発行、集計、リセット
app.get("/admin/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin.html"));
});

app.post("/admin/admin/update", (req, res) => {
  const { maxCapacity, distributedNumbers } = req.body;
  const data = readData();
  data.maxCapacity = maxCapacity || data.maxCapacity;
  if (distributedNumbers && Array.isArray(distributedNumbers)) {
    data.distributed = distributedNumbers;
    data.currentNumber = Math.max(...distributedNumbers, 0);
  }
  writeData(data);
  res.json({ ok: true });
});

app.get("/admin/stats", (req, res) => {
  const data = readData();
  res.json({
    distributed: data.distributed,
    checkedIn: data.checkedIn,
    checkedOut: data.checkedOut,
    currentNumber: data.currentNumber,
    callNumber: data.callNumber,
    skipped: data.skipped,
    maxCapacity: data.maxCapacity
  });
});

app.post("/admin/reset", (req, res) => {
  const data = {
    currentNumber: 0,
    distributed: [],
    checkedIn: 0,
    checkedOut: 0,
    maxCapacity: 20,
    callNumber: 0,
    skipped: []
  };
  writeData(data);
  res.json({ ok: true });
});

// 🚪 入場チェックイン
app.get("/admin/enter", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/enter.html"));
});

app.post("/enter", (req, res) => {
  const { number } = req.body;
  const data = readData();
  if (!data.distributed.includes(Number(number))) {
    return res.status(400).json({ error: "未配布の番号です" });
  }
  if (data.checkedIn - data.checkedOut >= data.maxCapacity) {
    return res.status(400).json({ error: "場内が満員です" });
  }
  data.checkedIn++;
  writeData(data);
  res.json({ ok: true });
});

// 🚪 退場チェックアウト
app.get("/admin/exit", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/exit.html"));
});

app.post("/exit", (req, res) => {
  const { number } = req.body;
  const data = readData();
  if (!data.distributed.includes(Number(number))) {
    return res.status(400).json({ error: "未配布の番号です" });
  }
  data.checkedOut++;
  writeData(data);
  res.json({ ok: true });
});

// 追加: USER用URLを保存する設定ファイル
const configFile = path.join(__dirname, "config.json");
function readConfig() {
  if (!fs.existsSync(configFile)) {
    fs.writeFileSync(configFile, JSON.stringify({ userUrl: "" }, null, 2));
  }
  return JSON.parse(fs.readFileSync(configFile, "utf-8"));
}
function writeConfig(config) {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), "utf-8");
}

// 追加: USER URL設定API
app.post("/admin/setUserUrl", (req, res) => {
  const { userUrl } = req.body;
  const config = readConfig();
  config.userUrl = userUrl;
  writeConfig(config);
  res.json({ ok: true });
});

// 修正: PDF生成（表＝USER URL、裏＝番号のみ）
app.get("/admin/pdf", async (req, res) => {
  try {
    const start = parseInt(req.query.start);
    const end = parseInt(req.query.end);
    if (isNaN(start) || isNaN(end) || start > end) {
      return res.status(400).send("番号範囲が正しくありません");
    }

    const config = readConfig();
    if (!config.userUrl) {
      return res.status(400).send("USER用URLが設定されていません");
    }

    const filePath = path.join(__dirname, "tickets.pdf");
    const doc = new PDFDocument({ size: "A4", margin: 30, autoFirstPage: false });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
    doc.registerFont("JP", fontPath);

    const perPage = 12;
    const cols = 2;
    const rows = 6;
    const ticketWidth = 250;
    const ticketHeight = 120;
    let count = 0;

    for (let num = start; num <= end; num++) {
      if (count % perPage === 0) {
        doc.addPage();
      }
      const col = count % cols;
      const row = Math.floor((count % perPage) / cols);
      const x = 50 + col * (ticketWidth + 20);
      const y = 50 + row * (ticketHeight + 20);

      // 表QR（利用者用URL）
      const frontUrl = `${config.userUrl}?number=${num}`;
      const frontQR = await qrcode.toDataURL(frontUrl);
      const frontBuffer = Buffer.from(frontQR.replace(/^data:image\/png;base64,/, ""), "base64");

      // 裏QR（番号のみ）
      const backQR = await qrcode.toDataURL(String(num));
      const backBuffer = Buffer.from(backQR.replace(/^data:image\/png;base64,/, ""), "base64");

      // 整理券枠
      doc.rect(x, y, ticketWidth, ticketHeight).stroke();

      // 表QR（左）
      doc.image(frontBuffer, x + 10, y + 10, { width: 80, height: 80 });
      doc.font("JP").fontSize(10).text("表：利用者用", x + 10, y + 95);

      // 裏QR（右）
      doc.image(backBuffer, x + 100, y + 10, { width: 80, height: 80 });
      doc.font("JP").fontSize(10).text("裏：入退場用", x + 100, y + 95);

      // 番号中央表示
      doc.font("JP").fontSize(16).text(
        `整理券番号: ${num}`,
        x + 10,
        y + ticketHeight - 25,
        { width: ticketWidth - 20, align: "center" }
      );

      count++;
    }

    doc.end();
    stream.on("finish", () => {
      res.download(filePath, `tickets_${start}-${end}.pdf`);
    });
  } catch (e) {
    console.error("PDF生成エラー:", e);
    res.status(500).send("PDF生成に失敗しました");
  }
});

// 利用者画面
app.get("/user/user.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public/user/user.html"));
});

// ルート
app.get("/", (req, res) => res.redirect("/admin/admin"));

app.listen(PORT, () => console.log(`✅ サーバー起動: http://localhost:${PORT}`));
// WebSocket用
const http = require("http");
const { WebSocketServer } = require("ws");
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// 📡 接続中のクライアントを管理
function broadcast(data) {
  const msg = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === 1) client.send(msg);
  });
}

// 🕒 呼び出し番号の自動スキップ管理
let currentCallNumber = 0;
let lastCallTime = null;
const SKIP_INTERVAL = 5 * 60 * 1000; // 5分

// 呼び出し番号を更新
function updateCallNumber(data) {
  // 現在の場内人数（入場−退場）
  const inVenue = data.checkedIn - data.checkedOut;
  const nextNumber = data.distributed.length > 0 ? Math.max(...data.distributed) : 0;

  // 最大収容数に空きがある＆配布済みがまだあるなら進める
  if (inVenue < data.maxCapacity && nextNumber > currentCallNumber) {
    currentCallNumber++;
    lastCallTime = Date.now();
    broadcast({ type: "callUpdate", number: currentCallNumber });
  }
}

// 5分ごとにスキップチェック
setInterval(() => {
  const data = readData();
  if (lastCallTime && Date.now() - lastCallTime > SKIP_INTERVAL) {
    // スキップして次へ
    currentCallNumber++;
    lastCallTime = Date.now();
    broadcast({ type: "callUpdate", number: currentCallNumber });
  }
}, 30000); // 30秒ごとに確認

// 管理UIから明示的に呼び出し更新するルート
app.post("/admin/call/update", (req, res) => {
  const data = readData();
  updateCallNumber(data);
  res.json({ currentCallNumber });
});

// 利用者画面に現在の呼び出し番号を返す
app.get("/user/current-call", (req, res) => {
  res.json({ number: currentCallNumber });
});

// 🔸 WebSocket接続時
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "callUpdate", number: currentCallNumber }));
});
// PDF発行範囲対応ルート
app.get('/admin/pdf', (req, res) => {
  const start = parseInt(req.query.start, 10);
  const end = parseInt(req.query.end, 10);
  if (isNaN(start) || isNaN(end) || start > end) {
    return res.status(400).send('番号範囲が不正です');
  }

  // PDF生成処理（例：reportlab などでチケットPDF作成）
  const PDFDocument = require('pdfkit');
  const fs = require('fs');
  const path = require('path');
  res.setHeader('Content-Type', 'application/pdf');

  const doc = new PDFDocument({ size: 'A4' });
  doc.pipe(res);

  const fontPath = path.join(__dirname, 'NotoSansJP-ExtraBold.ttf');
  doc.registerFont('NotoSansJP', fontPath);
  doc.font('NotoSansJP').fontSize(24);

  for (let i = start; i <= end; i++) {
    doc.text(`整理券番号：${i}`, 100, 100);
    if (i !== end) doc.addPage();
  }

  doc.end();
});
