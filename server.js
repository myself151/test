const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const bodyParser = require("body-parser");
const qrcode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア
app.use(bodyParser.json());
app.use("/public", express.static(path.join(__dirname, "public")));

// データファイル
const dataFile = path.join(__dirname, "data.json");
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(
    dataFile,
    JSON.stringify({
      currentNumber: 0,
      distributed: [],
      checkedIn: 0,
      checkedOut: 0,
      maxCapacity: 20
    }, null, 2)
  );
}

// データ読み書き
function readData() {
  return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
}
function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf-8");
}

// ルートアクセス（利用者画面）
app.get("/user", (req, res) => {
  res.sendFile(path.join(__dirname, "public/user/user.html"));
});

// 管理者画面
app.get("/admin/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin.html"));
});

// 整理券発行（管理者画面内ボタン操作）
app.post("/admin/issue", (req, res) => {
  const { start, end, url } = req.body;
  const data = readData();
  let issuedNumbers = [];
  for (let num = start; num <= end; num++) {
    data.distributed.push(num);
    data.currentNumber = Math.max(data.currentNumber, num);
    issuedNumbers.push(num);
  }
  writeData(data);
  res.json({ issued: issuedNumbers });
});

// PDF生成
app.post("/admin/pdf", async (req, res) => {
  try {
    const { start, end, url } = req.body;
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
      if (count % perPage === 0) doc.addPage();
      const col = count % cols;
      const row = Math.floor((count % perPage) / cols);
      const x = 50 + col * (ticketWidth + 20);
      const y = 50 + row * (ticketHeight + 20);

      const qrDataUrl = await qrcode.toDataURL(`${url}?number=${num}`);
      const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

      doc.rect(x, y, ticketWidth, ticketHeight).stroke();
      doc.image(qrBuffer, x + 10, y + 10, { width: 80, height: 80 });
      doc.font("JP").fontSize(18).text(`整理券番号: ${num}`, x + 100, y + 40);

      count++;
    }

    doc.end();
    stream.on("finish", () => {
      res.download(filePath, "tickets.pdf");
    });
  } catch (e) {
    console.error("PDF生成エラー:", e);
    res.status(500).send("PDF生成に失敗しました");
  }
});

// 集計
app.get("/admin/stats", (req, res) => {
  const data = readData();
  res.json({
    distributed: data.distributed.length,
    checkedIn: data.checkedIn,
    checkedOut: data.checkedOut,
    currentNumber: data.currentNumber
  });
});

// リセット
app.post("/admin/reset", (req, res) => {
  const data = {
    currentNumber: 0,
    distributed: [],
    checkedIn: 0,
    checkedOut: 0,
    maxCapacity: 20
  };
  writeData(data);
  res.json({ ok: true });
});

// チェックイン
app.post("/enter", (req, res) => {
  const { number } = req.body;
  const data = readData();
  if (data.distributed.includes(Number(number))) {
    data.checkedIn++;
    writeData(data);
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: "未配布の番号です" });
  }
});

// チェックアウト
app.post("/exit", (req, res) => {
  const { number } = req.body;
  const data = readData();
  if (data.distributed.includes(Number(number))) {
    data.checkedOut++;
    writeData(data);
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: "未配布の番号です" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);
});
