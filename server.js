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

// 初期データ作成
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(dataFile, JSON.stringify({
    currentNumber: 0,
    nextNumber: 1,
    calledNumber: 0,
    maxPeople: 0,
    insideCount: 0,
    issuedTickets: []
  }, null, 2));
}

function readData() { return JSON.parse(fs.readFileSync(dataFile, "utf8")); }
function writeData(data) { fs.writeFileSync(dataFile, JSON.stringify(data, null, 2)); }

// ------------------------- ルーティング -------------------------
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

// ------------------------- 整理券発行 -------------------------
app.post("/ticket/issue", (req, res) => {
  const { start, end, url } = req.body;
  const data = readData();
  const tickets = [];

  for (let i = start; i <= end; i++) {
    data.nextNumber = Math.max(data.nextNumber, i + 1);
    data.issuedTickets.push({ number: i, issued: true });
    tickets.push({ number: i });
  }

  writeData(data);
  res.json({ tickets });
});

// ------------------------- 呼び出し更新 -------------------------
app.post("/admin/update-call", (req, res) => {
  const data = readData();
  const availableCall = data.insideCount + 1 <= data.maxPeople;
  if (availableCall) {
    data.calledNumber++;
  }
  writeData(data);
  res.json({ calledNumber: data.calledNumber });
});

// ------------------------- チェックイン -------------------------
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

// ------------------------- チェックアウト -------------------------
app.post("/checkout", (req, res) => {
  const data = readData();
  if (data.insideCount > 0) data.insideCount--;
  writeData(data);
  res.json({ insideCount: data.insideCount });
});

// ------------------------- PDF生成（両面・12分割対応） -------------------------
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

  for (let i = 0; i < numbers.length; i++) {
    const num = numbers[i];

    // 表面
    doc.font("Noto").fontSize(40).text(`整理券 No.${num}`, 50, 50);
    const qrURL = await QRCode.toDataURL(`${url}?n=${num}`);
    const qrBuffer = Buffer.from(qrURL.replace(/^data:image\/png;base64,/, ""), "base64");
    doc.image(qrBuffer, 50, 120, { width: 200 });

    // 裏面
    doc.addPage();
    doc.fontSize(30).text("チェックイン用", 50, 50);
    const qrNumURL = await QRCode.toDataURL(String(num));
    const qrNumBuffer = Buffer.from(qrNumURL.replace(/^data:image\/png;base64,/, ""), "base64");
    doc.image(qrNumBuffer, 50, 120, { width: 200 });

    if ((i + 1) % perPage === 0 && i < numbers.length - 1) {
      doc.addPage();
    }
  }

  doc.end();
  stream.on("finish", () => res.download(filePath));
});

// ------------------------- サーバー起動 -------------------------
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
