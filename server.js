// server.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const QRCode = require("qrcode");
const PDFDocument = require("pdfkit");

const app = express();
const PORT = 3000;

// --- 中間データ格納ファイル ---
const dataFile = path.join(__dirname, "data.json");

// 初期データ
if (!fs.existsSync(dataFile)) {
  fs.writeFileSync(
    dataFile,
    JSON.stringify({ currentNumber: 0, inside: 0, maxInside: 10, issued: [] }, null, 2)
  );
}

// --- ミドルウェア ---
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// --- 管理画面と利用者画面 ---
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
app.post("/issue", (req, res) => {
  const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
  const newNumber = data.issued.length > 0 ? Math.max(...data.issued) + 1 : 1;
  data.issued.push(newNumber);

  // 呼び出し番号を更新（場内最大人数を超えないように）
  const available = data.maxInside - data.inside;
  if (available > 0 && data.currentNumber < newNumber) {
    data.currentNumber = newNumber;
  }

  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
  res.json({ number: newNumber });
});

// --- 呼び出し番号・人数の取得 ---
app.get("/status", (req, res) => {
  const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
  res.json(data);
});

// --- 入場処理（カメラ or 手動） ---
app.post("/enter", (req, res) => {
  const { number } = req.body;
  const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
  if (data.inside < data.maxInside) {
    data.inside++;
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } else {
    res.json({ success: false, message: "満員です" });
  }
});

// --- 退場処理（EXITカメラ） ---
app.post("/exit", (req, res) => {
  const { number } = req.body;
  const data = JSON.parse(fs.readFileSync(dataFile, "utf-8"));
  if (data.inside > 0) {
    data.inside--;
    fs.writeFileSync(dataFile, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// --- PDF生成（両面対応：表→裏→表→裏） ---
app.post("/admin/pdf", async (req, res) => {
  const { start, end, url } = req.body;
  const doc = new PDFDocument({ size: "A4" });
  const filePath = path.join(__dirname, "tickets.pdf");
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const perPage = 12; // 1ページに12枚
  const totalTickets = end - start + 1;
  const totalPages = Math.ceil(totalTickets / perPage);

  // チケット番号を配列化
  const tickets = [];
  for (let i = start; i <= end; i++) {
    tickets.push(i);
  }

  // 両面印刷対応：表→裏→表→裏
  const orderedPages = [];
  for (let i = 0; i < totalPages; i += 2) {
    orderedPages.push(tickets.slice(i * perPage, (i + 1) * perPage)); // 表
    if ((i + 1) < totalPages) {
      orderedPages.push(tickets.slice((i + 1) * perPage, (i + 2) * perPage)); // 裏
    }
  }

  const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
  if (fs.existsSync(fontPath)) {
    doc.registerFont("Noto", fontPath);
  }

  for (let pageIndex = 0; pageIndex < orderedPages.length; pageIndex++) {
    if (pageIndex > 0) doc.addPage();

    const pageTickets = orderedPages[pageIndex];
    doc.font("Noto").fontSize(14).text(`整理券（${pageIndex + 1}ページ）`, 50, 40);

    const cols = 3;
    const rows = 4;
    const ticketWidth = 180;
    const ticketHeight = 100;
    const startX = 50;
    const startY = 80;
    const qrSize = 60;

    for (let i = 0; i < pageTickets.length; i++) {
      const num = pageTickets[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (ticketWidth + 10);
      const y = startY + row * (ticketHeight + 10);

      // 枠
      doc.rect(x, y, ticketWidth, ticketHeight).stroke();

      // 番号
      doc.fontSize(28).text(num.toString().padStart(3, "0"), x + 10, y + 10);

      // QRコード
      const qrData = await QRCode.toDataURL(`${url}?ticket=${num}`);
      const base64Data = qrData.replace(/^data:image\/png;base64,/, "");
      const buf = Buffer.from(base64Data, "base64");
      doc.image(buf, x + ticketWidth - qrSize - 10, y + 10, { width: qrSize });
    }
  }

  doc.end();

  stream.on("finish", () => {
    res.download(filePath, "tickets.pdf");
  });
});

// --- サーバー起動 ---
app.listen(PORT, () => {
  console.log(`✅ Server is running: http://localhost:${PORT}`);
});
