const express = require("express");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ public を静的配信
app.use(express.static(path.join(__dirname, "public")));

const dataFile = path.join(__dirname, "data.json");
function loadData() {
  if (!fs.existsSync(dataFile)) {
    return { current: 0, issued: [], checkedIn: [], checkedOut: [], capacity: 0, callAhead: 0 };
  }
  return JSON.parse(fs.readFileSync(dataFile, "utf8"));
}
function saveData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
}

// ✅ HTMLルート
app.get("/admin/admin", (req, res) => res.sendFile(path.join(__dirname, "public/admin/admin.html")));
app.get("/admin/enter", (req, res) => res.sendFile(path.join(__dirname, "public/admin/enter.html")));
app.get("/admin/exit", (req, res) => res.sendFile(path.join(__dirname, "public/admin/exit.html")));
app.get("/user/user", (req, res) => res.sendFile(path.join(__dirname, "public/user/user.html")));

// ✅ API: 整理券発行
app.post("/api/issue", (req, res) => {
  let data = loadData();
  const newNumber = (data.issued.length ? Math.max(...data.issued) : 0) + 1;
  data.issued.push(newNumber);
  saveData(data);
  res.json({ number: newNumber });
});

// ✅ API: 状態取得
app.get("/api/status", (req, res) => {
  res.json(loadData());
});

// ✅ API: チェックイン
app.post("/api/checkin", (req, res) => {
  let { number } = req.body;
  number = parseInt(number);
  let data = loadData();

  if (!data.checkedIn.includes(number) && data.issued.includes(number)) {
    data.checkedIn.push(number);
    saveData(data);
    return res.json({ success: true });
  }
  res.json({ success: false });
});

// ✅ API: チェックアウト
app.post("/api/checkout", (req, res) => {
  let { number } = req.body;
  number = parseInt(number);
  let data = loadData();

  if (!data.checkedOut.includes(number) && data.checkedIn.includes(number)) {
    data.checkedOut.push(number);
    saveData(data);
    return res.json({ success: true });
  }
  res.json({ success: false });
});

// ✅ API: 管理設定
app.post("/api/admin/settings", (req, res) => {
  let { capacity, callAhead } = req.body;
  let data = loadData();
  data.capacity = parseInt(capacity) || 0;
  data.callAhead = parseInt(callAhead) || 0;
  saveData(data);
  res.json({ success: true });
});

// ✅ PDF生成（12分割対応：3列×4行 表→裏）
app.post("/admin/pdf", async (req, res) => {
  const { start, end, url } = req.body;
  const filePath = path.join(__dirname, "tickets.pdf");

  const doc = new PDFDocument({ size: "A4", margin: 20 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
  if (fs.existsSync(fontPath)) {
    doc.font(fontPath);
  }

  const cols = 3;
  const rows = 4;
  const perPage = cols * rows;

  const boxWidth = 180;
  const boxHeight = 180;
  const startX = 40;
  const startY = 40;
  const colGap = 20;
  const rowGap = 20;

  let count = 0;

  for (let i = start; i <= end; i++) {
    const col = count % cols;
    const row = Math.floor((count % perPage) / cols);
    const x = startX + col * (boxWidth + colGap);
    const y = startY + row * (boxHeight + rowGap);

    // 表面
    doc.rect(x, y, boxWidth, boxHeight).stroke();
    doc.fontSize(18).text(`整理券 ${i}`, x + 20, y + 15);
    const qrDataUrl = await QRCode.toDataURL(`${url}?number=${i}`);
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
    doc.image(qrBuffer, x + 40, y + 50, { fit: [100, 100] });

    count++;

    // ページ切り替え
    if (count % perPage === 0 && i !== end) {
      doc.addPage();
    }
  }

  // 裏面
  doc.addPage();
  count = 0;
  for (let i = start; i <= end; i++) {
    const col = count % cols;
    const row = Math.floor((count % perPage) / cols);
    const x = startX + col * (boxWidth + colGap);
    const y = startY + row * (boxHeight + rowGap);

    doc.rect(x, y, boxWidth, boxHeight).stroke();
    doc.fontSize(14).text("チェックイン用", x + 25, y + 15);
    const qrCheckIn = await QRCode.toDataURL(`${i}`);
    const qrCheckInBuffer = Buffer.from(qrCheckIn.split(",")[1], "base64");
    doc.image(qrCheckInBuffer, x + 40, y + 50, { fit: [100, 100] });

    count++;
    if (count % perPage === 0 && i !== end) {
      doc.addPage();
    }
  }

  doc.end();
  stream.on("finish", () => res.download(filePath, "tickets.pdf"));
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
