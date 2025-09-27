const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const app = express();
const PORT = 3000;

// 静的ファイル
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// データ保存ファイル
const DATA_FILE = path.join(__dirname, "data.json");

// 初期化
if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify({
      currentNumber: 0,
      lastIssued: 0,
      maxCapacity: 10,
      inside: 0,
    }, null, 2)
  );
}

function readData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

/* ---------------- ユーザーAPI ---------------- */
// 整理券発行
app.post("/api/ticket", (req, res) => {
  const data = readData();
  data.lastIssued += 1;

  // 呼び出し番号は「入場者が場内最大人数を超えない範囲」で進める
  const available = data.maxCapacity - data.inside;
  if (available > 0 && data.currentNumber < data.lastIssued) {
    data.currentNumber += 1;
    data.inside += 1;
  }

  writeData(data);

  res.json({
    number: data.lastIssued,
    canEnter: data.currentNumber >= data.lastIssued,
    currentNumber: data.currentNumber,
    inside: data.inside,
  });
});

// 状態取得
app.get("/api/status", (req, res) => {
  res.json(readData());
});

/* ---------------- 管理者API ---------------- */
// 入場処理
app.post("/api/enter", (req, res) => {
  const data = readData();
  data.inside += 1;
  writeData(data);
  res.json({ inside: data.inside });
});

// 退場処理
app.post("/api/exit", (req, res) => {
  const data = readData();
  if (data.inside > 0) data.inside -= 1;
  writeData(data);
  res.json({ inside: data.inside });
});

// 最大人数変更
app.post("/api/capacity", (req, res) => {
  const { max } = req.body;
  const data = readData();
  data.maxCapacity = max;
  writeData(data);
  res.json({ maxCapacity: data.maxCapacity });
});

/* ---------------- PDF生成 ---------------- */
app.post("/admin/pdf", async (req, res) => {
  const { start, end, url } = req.body;
  const doc = new PDFDocument({ size: "A4" });
  const filePath = path.join(__dirname, "tickets.pdf");
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // フォント
  const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
  if (fs.existsSync(fontPath)) {
    doc.font(fontPath);
  } else {
    doc.font("Helvetica-Bold");
  }

  const perPage = 12;
  let x = 50, y = 50, count = 0;

  for (let i = start; i <= end; i++) {
    const qrData = await QRCode.toDataURL(`${url}?ticket=${i}`);
    const qrImage = qrData.replace(/^data:image\/png;base64,/, "");
    const imgPath = path.join(__dirname, `qr_${i}.png`);
    fs.writeFileSync(imgPath, qrImage, "base64");

    // QRコード描画
    doc.image(imgPath, x, y, { width: 100, height: 100 });
    doc.fontSize(20).text(`整理券番号: ${i}`, x, y + 110);

    fs.unlinkSync(imgPath);

    x += 200;
    count++;
    if (count % 3 === 0) {
      x = 50;
      y += 200;
    }
    if (count % perPage === 0 && i < end) {
      doc.addPage();
      x = 50;
      y = 50;
    }
  }

  doc.end();

  stream.on("finish", () => {
    res.download(filePath);
  });
});

/* ---------------- 画面 ---------------- */
app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin.html"));
});
app.get("/user", (req, res) => {
  res.sendFile(path.join(__dirname, "public/user/user.html"));
});

/* ---------------- サーバー起動 ---------------- */
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});
