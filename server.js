// server.js
const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");

const app = express();
app.use(bodyParser.json());

// ✅ 静的ファイル (フロントエンド) を配信
app.use(express.static(path.join(__dirname, "public")));

// ✅ フォントの絶対パス (ユーザーの環境にあるフォントファイル)
const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");

// ==================================================
// 整理券 PDF 生成
// ==================================================
app.post("/admin/pdf", (req, res) => {
  const { start, end, url } = req.body;

  if (!start || !end) {
    return res.status(400).json({ error: "start と end を指定してください" });
  }

  const filePath = path.join(__dirname, "tickets.pdf");
  const doc = new PDFDocument({ size: "A4", margin: 50 });

  // ファイルに保存
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  // ✅ フォント登録
  if (fs.existsSync(fontPath)) {
    doc.registerFont("NotoSansJP", fontPath);
  } else {
    console.warn("⚠ フォントファイルが見つかりません:", fontPath);
  }

  const perPage = 12; // 1ページあたり整理券数
  let numCount = 0;

  for (let i = start; i <= end; i++) {
    if (numCount > 0 && numCount % perPage === 0) {
      doc.addPage();
    }

    const x = 70 + (numCount % 3) * 160; // 横方向の配置
    const y = 70 + (Math.floor((numCount % perPage) / 3) * 200); // 縦方向の配置

    // チケット枠
    doc.rect(x, y, 140, 180).stroke();

    // 番号 (中央に大きく表示)
    doc.font("NotoSansJP")
      .fontSize(40)
      .text(`No.${i}`, x, y + 60, { width: 140, align: "center" });

    // URL (小さめに下部へ)
    if (url) {
      doc.fontSize(10).text(url, x, y + 150, { width: 140, align: "center" });
    }

    numCount++;
  }

  // ✅ PDF 完了
  doc.end();

  // ✅ 書き込み完了後にレスポンス返却
  stream.on("finish", () => {
    res.download(filePath, "tickets.pdf", (err) => {
      if (err) {
        console.error("PDF送信エラー:", err);
      }
    });
  });
});

// ==================================================
// サンプル：呼び出し番号ロジック（簡易版）
// ==================================================
let calledNumber = 0;
let issuedNumbers = [];

app.post("/ticket", (req, res) => {
  const ticketNo = issuedNumbers.length + 1;
  issuedNumbers.push(ticketNo);
  res.json({ ticket: ticketNo });
});

app.post("/admin/call", (req, res) => {
  const { maxCapacity, checkedOut } = req.body;
  const inside = issuedNumbers.filter(n => n > checkedOut && n <= calledNumber);
  const canEnter = maxCapacity - inside.length;

  if (canEnter > 0) {
    calledNumber += canEnter;
  }

  res.json({ calledNumber, canEnter });
});

// ==================================================
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running http://localhost:${PORT}`);
});
