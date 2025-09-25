// server.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const bodyParser = require("body-parser");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static("public"));

// --- Rate limiter (ユーザー側のみ) ---
const userLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, please try again after 5 minutes.",
});
app.use("/user", userLimiter);

// --- メモリ上データ ---
let tickets = [];      // 発行済み整理券番号
let calledIndex = 0;   // 現在呼び出し番号
let userStatus = {};   // {番号:{checkedIn:bool, skipped:bool, startTime:timestamp}}
let maxVenue = 10;     // 場内人数
let adminPassword = null;

// --- PDF生成 ---
app.get("/admin/pdf", (req, res) => {
  if (!tickets.length) return res.send("整理券なし");
  const doc = new PDFDocument({ size: "A4" });
  const fontPath = path.join(__dirname, "fonts", "NotoSansJP-ExtraBold.ttf");
  if (!fs.existsSync(fontPath)) return res.status(500).send("フォントなし");
  doc.registerFont("NotoSans", fontPath);
  doc.font("NotoSans");
  res.setHeader("Content-Type", "application/pdf");
  doc.pipe(res);

  tickets.forEach((num, i) => {
    if (i > 0) doc.addPage();
    // 表
    doc.text(`整理券番号: ${num}`, 50, 50);
    doc.text(`QR: URLはこちら`, 50, 100);
    // 裏
    doc.addPage();
    doc.text(`裏面`, 50, 50);
    doc.text(`チェックイン用QR: ${num}`, 50, 100);
  });
  doc.end();
});

// --- 管理者チェックイン／exit---
app.post("/admin/checkin", (req, res) => {
  const ticket = req.body.ticket;
  if (userStatus[ticket]) {
    userStatus[ticket].checkedIn = true;
    res.json({ ok: true });
  } else res.json({ ok: false });
});

// --- ユーザー登録 ---
app.post("/user/register", (req, res) => {
  const number = req.body.number;
  if (!tickets.includes(number)) tickets.push(number);
  userStatus[number] = { checkedIn: false, skipped: false, startTime: null };
  res.json({ ok: true });
});

// --- 現在呼び出し番号 ---
app.get("/user/current", (req, res) => {
  const current = tickets[calledIndex] || null;
  res.json({ current });
});

// --- スキップ判定（呼び出し番号から3分経過） ---
setInterval(() => {
  const num = tickets[calledIndex];
  if (num && !userStatus[num].checkedIn) {
    const startTime = userStatus[num].startTime || Date.now();
    if (!userStatus[num].startTime) userStatus[num].startTime = startTime;
    if (Date.now() - startTime >= 180000) { // 3分経過
      userStatus[num].skipped = true;
      calledIndex++;
    }
  }
}, 10000);

// --- 集計 ---
app.get("/admin/summary", (req, res) => {
  const total = tickets.length;
  const checked = Object.values(userStatus).filter(u => u.checkedIn).length;
  const skipped = Object.values(userStatus).filter(u => u.skipped).length;
  res.json({ total, checked, skipped });
});

// --- リセット ---
app.post("/admin/reset", (req, res) => {
  calledIndex = 0;
  Object.keys(userStatus).forEach(k => {
    userStatus[k].checkedIn = false;
    userStatus[k].skipped = false;
    userStatus[k].startTime = null;
  });
  res.json({ ok: true });
});

// --- 管理者パスワード設定（admin/adminのみ） ---
app.post("/admin/setpassword", (req, res) => {
  if (!adminPassword) {
    adminPassword = req.body.password;
    res.json({ ok: true });
  } else res.json({ ok: false, msg: "すでに設定済み" });
});

// --- 管理者場内人数設定 ---
app.post("/admin/setvenue", (req, res) => {
  maxVenue = req.body.max || 10;
  res.json({ ok: true, maxVenue });
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
