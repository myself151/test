const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const bodyParser = require("body-parser");
const qrcode = require("qrcode");

const app = express();
const PORT = 3000;

// 静的ファイル配信
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// 📌 データファイル
const dataFile = path.join(__dirname, "data.json");
function readData() {
  if (!fs.existsSync(dataFile)) {
    const initialData = {
      currentNumber: 0,
      distributed: [],
      checkedIn: 0,
      checkedOut: 0,
      maxCapacity: 20
    };
    fs.writeFileSync(dataFile, JSON.stringify(initialData, null, 2), "utf-8");
  }
  return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
}
function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf-8");
}

// ── 管理者UIへのルート ──
app.get('/admin/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/admin.html'));
});
app.get('/admin/enter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/enter.html'));
});
app.get('/admin/exit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/exit.html'));
});

// ── 整理券発行 ──
app.post("/admin/issue", (req, res) => {
  const data = readData();
  data.currentNumber += 1;
  data.distributed.push(data.currentNumber);
  writeData(data);
  res.json({ number: data.currentNumber });
});

// ── 集計 ──
app.get("/admin/stats", (req, res) => {
  const data = readData();
  res.json({
    distributed: data.distributed.length,
    checkedIn: data.checkedIn,
    checkedOut: data.checkedOut,
    currentNumber: data.currentNumber,
  });
});

// ── リセット ──
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

// ── チェックイン ──
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

// ── チェックアウト ──
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

// ── PDF生成（両面・日本語フォント対応） ──
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
      if (count % perPage === 0) {
        doc.addPage();
      }
      const col = count % cols;
      const row = Math.floor((count % perPage) / cols);
      const x = 50 + col * (ticketWidth + 20);
      const y = 50 + row * (ticketHeight + 20);

      const qrDataUrl = await qrcode.toDataURL(`${url}?number=${num}`);
      const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

      // 表面：番号とQR
      doc.rect(x, y, ticketWidth, ticketHeight).stroke();
      doc.image(qrBuffer, x + 10, y + 10, { width: 80, height: 80 });
      doc.font("JP").fontSize(18).text(`整理券番号: ${num}`, x + 100, y + 40);

      // 裏面：チェックインQRのみ
      const qrCheckInDataUrl = await qrcode.toDataURL(`${num}`);
      const qrCheckInBuffer = Buffer.from(qrCheckInDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.addPage();
      doc.rect(50, 50, ticketWidth, ticketHeight).stroke();
      doc.font("JP").fontSize(18).text("チェックイン用", 60, 60);
      doc.image(qrCheckInBuffer, 60, 90, { width: 80, height: 80 });

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

// ── サーバ起動 ──
app.listen(PORT, () => {
  console.log(`✅ サーバー起動: http://localhost:${PORT}`);
});
