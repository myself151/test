const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const dataFile = path.join(__dirname, "data.json");

// 初期データ
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      currentNumber: 0,
      nextNumber: 1,
      calledNumber: 0,
      maxPeople: 0,
      insideCount: 0
    })
  );
}

function readData() {
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}
function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// --- ルーティング ---
app.get("/admin/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "admin.html"));
});
app.get("/admin/enter", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "enter.html"));
});
app.get("/admin/exit", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "exit.html"));
});
app.get("/user/user", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "user", "user.html"));
});

// --- 整理券発行 ---
app.post("/ticket/issue", (req, res) => {
  const data = readData();
  const num = data.nextNumber;
  data.nextNumber++;
  writeData(data);
  res.json({ number: num });
});

// --- 呼び出し更新 ---
app.post("/admin/update-call", (req, res) => {
  const data = readData();
  const nextCall =
    data.insideCount + 1 <= data.maxPeople ? data.calledNumber + 1 : data.calledNumber;
  data.calledNumber = nextCall;
  writeData(data);
  res.json({ calledNumber: data.calledNumber });
});

// --- 入場チェックイン ---
app.post("/checkin", (req, res) => {
  const { number } = req.body;
  const data = readData();
  if (number <= data.calledNumber) {
    data.insideCount++;
    writeData(data);
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// --- 退場チェックアウト ---
app.post("/checkout", (req, res) => {
  const data = readData();
  if (data.insideCount > 0) data.insideCount--;
  writeData(data);
  res.json({ insideCount: data.insideCount });
});

// --- キャンセル ---
app.post("/cancel", (req, res) => {
  const { number } = req.body;
  // 管理用: 未使用番号として戻すなど
  res.json({ success: true });
});

// --- 設定更新 ---
app.post("/admin/settings", (req, res) => {
  const { maxInside, notifyAhead } = req.body;
  const data = readData();
  data.maxPeople = maxInside || data.maxPeople;
  writeData(data);
  res.json({ success: true });
});

// --- 状態確認 ---
app.get("/api/status", (req, res) => {
  res.json(readData());
});

// --- PDF生成（12分割・表裏分離） ---
app.post("/admin/pdf", async (req, res) => {
  const { start, end, url } = req.body;
  const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
  const filePath = path.join(__dirname, "tickets.pdf");
  const doc = new PDFDocument({ size: "A4" });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.registerFont("Noto", fontPath);

  const perPage = 12;
  const numbers = [];
  for (let i = start; i <= end; i++) numbers.push(i);

  const cols = 2;
  const rows = 6;
  const pageWidth = 595.28; // A4 pt
  const pageHeight = 841.89;
  const cellWidth = pageWidth / cols;
  const cellHeight = pageHeight / rows;

  // --- 表面 ---
  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const x = col * cellWidth + 20;
    const y = row * cellHeight + 20;

    doc.font("Noto").fontSize(24).text(`整理券 No.${num}`, x, y);
    const qrDataURL = await QRCode.toDataURL(`${url}?n=${num}`);
    const qrImg = qrDataURL.replace(/^data:image\/png;base64,/, "");
    const qrBuffer = Buffer.from(qrImg, "base64");
    doc.image(qrBuffer, x, y + 30, { width: 100 });

    if ((i + 1) % perPage === 0 && i < numbers.length - 1) doc.addPage();
  }

  doc.addPage();

  // --- 裏面 ---
  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];
    const col = i % cols;
    const row = Math.floor(i / cols) % rows;
    const x = col * cellWidth + 20;
    const y = row * cellHeight + 20;

    doc.font("Noto").fontSize(20).text("チェックイン用", x, y);
    const qrNumDataURL = await QRCode.toDataURL(String(num));
    const qrNumImg = qrNumDataURL.replace(/^data:image\/png;base64,/, "");
    const qrNumBuffer = Buffer.from(qrNumImg, "base64");
    doc.image(qrNumBuffer, x, y + 30, { width: 100 });

    if ((i + 1) % perPage === 0 && i < numbers.length - 1) doc.addPage();
  }

  doc.end();

  stream.on("finish", () => {
    res.download(filePath);
  });
});

// --- サーバー起動 ---
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
