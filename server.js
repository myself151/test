const express = require("express");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

const DATA_FILE = path.join(__dirname, "data.json");

// データ読み書き
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return {
    issued: [], checkedIn: [], checkedOut: [],
    capacity: 0, callAhead: 0, currentCall: 0
  };
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// -------------------------
// HTMLルート
// -------------------------
app.get("/admin/admin", (req, res) => res.sendFile(path.join(__dirname, "public/admin/admin.html")));
app.get("/admin/enter", (req, res) => res.sendFile(path.join(__dirname, "public/admin/enter.html")));
app.get("/admin/exit", (req, res) => res.sendFile(path.join(__dirname, "public/admin/exit.html")));
app.get("/user/user", (req, res) => res.sendFile(path.join(__dirname, "public/user/user.html")));

// -------------------------
// API: 管理設定
// -------------------------
app.post("/api/admin/settings", (req, res) => {
  const { capacity, callAhead } = req.body;
  const data = loadData();
  data.capacity = parseInt(capacity) || 0;
  data.callAhead = parseInt(callAhead) || 0;
  saveData(data);
  res.json({ success: true });
});

// -------------------------
// API: 整理券発行
// -------------------------
app.post("/api/issue", (req, res) => {
  const data = loadData();
  const newNumber = (data.issued.length ? Math.max(...data.issued) : 0) + 1;
  data.issued.push(newNumber);
  saveData(data);
  res.json({ number: newNumber });
});

// -------------------------
// API: 状態取得
// -------------------------
app.get("/api/status", (req, res) => {
  res.json(loadData());
});

// -------------------------
// API: チェックイン
// -------------------------
app.post("/api/checkin", (req, res) => {
  const { number } = req.body;
  const num = parseInt(number);
  const data = loadData();

  if (!data.checkedIn.includes(num) && data.issued.includes(num)) {
    data.checkedIn.push(num);
    // 呼び出し番号更新
    data.currentCall = Math.min(...data.issued.filter(n => !data.checkedIn.includes(n)));
    saveData(data);
    return res.json({ success: true });
  }
  res.json({ success: false });
});

// -------------------------
// API: チェックアウト
// -------------------------
app.post("/api/checkout", (req, res) => {
  const { number } = req.body;
  const num = parseInt(number);
  const data = loadData();

  if (!data.checkedOut.includes(num) && data.checkedIn.includes(num)) {
    data.checkedOut.push(num);
    saveData(data);
    return res.json({ success: true });
  }
  res.json({ success: false });
});

// -------------------------
// API: PDF生成（表12分割 + 裏12分割）
// -------------------------
app.post("/admin/pdf", async (req, res) => {
  const { start, end, url } = req.body;
  const filePath = path.join(__dirname, "tickets.pdf");
  const doc = new PDFDocument({ size: "A4", margin: 20 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
  if (fs.existsSync(fontPath)) doc.font(fontPath);

  const cols = 3, rows = 4, perPage = cols * rows;
  const boxW = 180, boxH = 180, startX = 40, startY = 40, colGap = 20, rowGap = 20;

  // 表面
  let count = 0;
  for (let i = start; i <= end; i++) {
    const col = count % cols;
    const row = Math.floor((count % perPage) / cols);
    const x = startX + col * (boxW + colGap);
    const y = startY + row * (boxH + rowGap);

    doc.rect(x, y, boxW, boxH).stroke();
    doc.fontSize(18).text(`整理券 ${i}`, x + 20, y + 15);
    const qrDataUrl = await QRCode.toDataURL(`${url}?number=${i}`);
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
    doc.image(qrBuffer, x + 40, y + 50, { fit: [100, 100] });

    count++;
    if (count % perPage === 0 && i !== end) doc.addPage();
  }

  // 裏面
  doc.addPage();
  count = 0;
  for (let i = start; i <= end; i++) {
    const col = count % cols;
    const row = Math.floor((count % perPage) / cols);
    const x = startX + col * (boxW + colGap);
    const y = startY + row * (boxH + rowGap);

    doc.rect(x, y, boxW, boxH).stroke();
    doc.fontSize(14).text("チェックイン用", x + 25, y + 15);
    const qrCheckIn = await QRCode.toDataURL(`${i}`);
    const qrBuffer = Buffer.from(qrCheckIn.split(",")[1], "base64");
    doc.image(qrBuffer, x + 40, y + 50, { fit: [100, 100] });

    count++;
    if (count % perPage === 0 && i !== end) doc.addPage();
  }

  doc.end();
  stream.on("finish", () => res.download(filePath, "tickets.pdf"));
});

app.listen(PORT, () => console.log(`✅ Server running at http://localhost:${PORT}`));
