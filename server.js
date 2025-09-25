const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== データ管理 =====
let tickets = [];
let checkedIn = [];
let skipped = [];
let adminPassword = null;
let maxInside = 0;
let currentCallIndex = 0;

// ===== 管理者パスワード設定 =====
app.post("/admin/setpassword", (req, res) => {
  const { password } = req.body;
  adminPassword = password;
  res.json({ status: "パスワード設定完了" });
});

// ===== 最大人数設定 =====
app.post("/admin/setmax", (req, res) => {
  maxInside = Number(req.body.max);
  res.json({ status: `最大人数を ${maxInside} に設定` });
});

// ===== 整理券発行 =====
app.post("/admin/issue", (req, res) => {
  const { start, end } = req.body;
  tickets = [];
  for (let i = start; i <= end; i++) tickets.push(i);
  checkedIn = [];
  skipped = [];
  currentCallIndex = 0;
  res.json({ issuedTickets: tickets });
});

// ===== PDF生成（日本語フォント埋め込み・安全両面対応） =====
app.get("/admin/pdf", async (req, res) => {
  if (!tickets.length) return res.status(400).send("整理券未発行");

  const doc = new PDFDocument({ size: "A4" });

  // フォント埋め込み（日本語対応）
  const fontPath = path.join(__dirname, "fonts", "NotoSansCJKjp-Regular.otf");
  if (!fs.existsSync(fontPath)) {
    return res.status(500).send("フォントファイルが存在しません: fonts/NotoSansCJKjp-Regular.otf");
  }
  doc.registerFont("NotoSans", fontPath);
  doc.font("NotoSans");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=tickets.pdf");
  doc.pipe(res);

  const cols = 3;
  const rows = 4;
  const pageWidth = 595;
  const pageHeight = 842;
  const boxW = pageWidth / cols;
  const boxH = pageHeight / rows;

  for (const [index, num] of tickets.entries()) {
    const col = index % cols;
    const row = Math.floor(index / cols) % rows;
    const x = col * boxW + 10;
    const y = row * boxH + 10;

    // ===== 表面 =====
    const urlQR = await QRCode.toDataURL(`https://example.com/user?ticket=${num}`);
    const urlBuf = Buffer.from(urlQR.replace(/^data:image\/png;base64,/, ""), "base64");

    doc.rect(col*boxW, row*boxH, boxW, boxH).stroke();
    doc.fontSize(16).text(`整理券番号: ${num}`, x, y);
    doc.fontSize(12).text(`こちらのURLです`, x, y+25);
    doc.image(urlBuf, x + 150, y, { width: 50, height: 50 });

    if ((index+1) % (cols*rows) === 0) doc.addPage(); // 表面ページ終了後

    // ===== 裏面 =====
    const checkinQR = await QRCode.toDataURL(`${num}`);
    const checkinBuf = Buffer.from(checkinQR.replace(/^data:image\/png;base64,/, ""), "base64");

    doc.rect(col*boxW, row*boxH, boxW, boxH).stroke();
    doc.fontSize(16).text("チェックイン用", x, y);
    doc.fontSize(14).text(`番号: ${num}`, x, y+25);
    doc.image(checkinBuf, x + 150, y, { width: 50, height: 50 });

    if ((index+1) % (cols*rows) === 0) doc.addPage(); // 裏面ページ終了後
  }

  doc.end();
});

// ===== 集計 =====
app.get("/admin/summary", (req, res) => {
  res.json({
    issued: tickets.length,
    checkedIn,
    skipped,
    maxInside,
    currentCallIndex
  });
});

// ===== リセット =====
app.post("/admin/reset", (req, res) => {
  tickets = [];
  checkedIn = [];
  skipped = [];
  currentCallIndex = 0;
  res.json({ status: "リセット完了" });
});

// ===== 呼び出し番号取得 =====
app.get("/user/current", (req, res) => {
  const current = tickets.slice(currentCallIndex, currentCallIndex+3);
  res.json({ currentCall: current });
});

// ===== 利用者チェックイン =====
app.post("/user/checkin", (req, res) => {
  const { ticketNumber } = req.body;
  if (!checkedIn.includes(ticketNumber)) checkedIn.push(ticketNumber);
  res.json({ status: "チェックイン完了" });
});

// ===== 利用者キャンセル =====
app.post("/user/cancel", (req, res) => {
  const { ticketNumber } = req.body;
  checkedIn = checkedIn.filter(n => n !
