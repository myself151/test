const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

// 📂 静的ファイル（/public 以下すべて配信）
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// ✅ HTMLページのルーティング
app.get("/admin/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin.html"));
});

app.get("/admin/enter", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/enter.html"));
});

app.get("/admin/exit", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/exit.html"));
});

app.get("/user", (req, res) => {
  res.sendFile(path.join(__dirname, "public/user/user.html"));
});

// ✅ 状態保存ファイル
const dataFile = path.join(__dirname, "data.json");
let state = {
  tickets: [],
  currentCall: 0,
  checkedOut: 0,
  maxInside: 10,
};

// 初期ロード
if (fs.existsSync(dataFile)) {
  state = JSON.parse(fs.readFileSync(dataFile, "utf8"));
}

// 状態保存関数
function saveState() {
  fs.writeFileSync(dataFile, JSON.stringify(state, null, 2));
}

// 🎫 整理券発行
app.post("/ticket", (req, res) => {
  const ticketNo = state.tickets.length + 1;
  state.tickets.push(ticketNo);
  saveState();
  res.json({ ticket: ticketNo });
});

// 📢 呼び出し更新
app.post("/admin/call", (req, res) => {
  const available = state.maxInside - (state.tickets.length - state.checkedOut);
  if (available > 0) {
    state.currentCall += 1;
  }
  saveState();
  res.json({ currentCall: state.currentCall });
});

// 🚪 チェックアウト
app.post("/checkout", (req, res) => {
  state.checkedOut += 1;
  saveState();
  res.json({ checkedOut: state.checkedOut });
});

// 📄 PDF生成（両面）
app.post("/admin/pdf", async (req, res) => {
  const { start, end, url } = req.body;
  const doc = new PDFDocument({ size: "A4" });
  const filePath = path.join(__dirname, "tickets.pdf");
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  for (let i = start; i <= end; i++) {
    // 表面
    doc.fontSize(20).text(`整理券 No.${i}`, 100, 100);
    const qr1 = await QRCode.toDataURL(`${url}?ticket=${i}`);
    const img1 = Buffer.from(qr1.split(",")[1], "base64");
    doc.image(img1, 100, 150, { width: 150 });
    doc.addPage();

    // 裏面
    doc.fontSize(16).text("チェックイン用", 100, 100);
    const qr2 = await QRCode.toDataURL(`${i}`);
    const img2 = Buffer.from(qr2.split(",")[1], "base64");
    doc.image(img2, 100, 150, { width: 150 });
    if (i < end) doc.addPage();
  }

  doc.end();
  stream.on("finish", () => {
    res.download(filePath);
  });
});

// 🚀 サーバー起動
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
