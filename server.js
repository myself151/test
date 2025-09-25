const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// ===== DDOS対策（ユーザー側のみ） =====
const userLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: "Too many requests from this IP, try again after 5 minutes",
});
app.use("/user", userLimiter);

// ===== 管理者パスワード =====
let adminPassword = null;

// ===== 整理券管理 =====
let ticketStart = 1;
let ticketEnd = 12;
let currentTicket = ticketStart;
let issuedTickets = [];
let checkedIn = [];
let skipped = [];
let waitingUsers = {};
let maxInside = 0; // admin/adminで設定

// ===== ルート =====
app.get("/admin/admin", (req, res) => res.sendFile(path.join(__dirname, "public/admin/admin.html")));
app.get("/admin/enter", (req, res) => res.sendFile(path.join(__dirname, "public/admin/enter.html")));
app.get("/admin/exit", (req, res) => res.sendFile(path.join(__dirname, "public/admin/exit.html")));
app.get("/user", (req, res) => res.sendFile(path.join(__dirname, "public/user.html")));

// ===== パスワード設定 =====
app.post("/admin/setpassword", (req, res) => {
  const { password } = req.body;
  if (!adminPassword) {
    adminPassword = password;
    return res.json({ status: "ok" });
  }
  return res.status(403).json({ status: "already set" });
});

// ===== 最大人数設定 =====
app.post("/admin/setmax", (req, res) => {
  const { max } = req.body;
  maxInside = Number(max);
  res.json({ status: "ok" });
});

// ===== 整理券発行 =====
app.post("/admin/issue", (req, res) => {
  const { start, end } = req.body;
  ticketStart = start;
  ticketEnd = end;
  currentTicket = start;
  issuedTickets = [];
  for (let i = start; i <= end; i++) issuedTickets.push(i);
  checkedIn = [];
  skipped = [];
  res.json({ status: "ok", issuedTickets });
});

// ===== チェックイン =====
app.post("/user/checkin", (req, res) => {
  const { ticketNumber } = req.body;
  if (!checkedIn.includes(ticketNumber)) checkedIn.push(ticketNumber);
  delete waitingUsers[ticketNumber];
  res.json({ status: "checkedin" });
});

// ===== スキップ処理 =====
function skipTicket(ticketNumber) {
  if (!checkedIn.includes(ticketNumber) && !skipped.includes(ticketNumber)) skipped.push(ticketNumber);
}

// ===== PDF生成 =====
app.post("/admin/pdf", (req, res) => {
  const doc = new PDFDocument({ size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", "attachment; filename=tickets.pdf");
  doc.pipe(res);
  const cols = 3, rows = 4;
  const width = 595 / cols, height = 842 / rows;
  let index = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (index >= issuedTickets.length) break;
      doc.rect(c * width, r * height, width, height).stroke();
      doc.text(issuedTickets[index], c * width + 10, r * height + 10);
      index++;
    }
  }
  doc.end();
});

// ===== 集計 =====
app.get("/admin/summary", (req, res) => {
  res.json({
    issued: issuedTickets.length,
    checkedIn: checkedIn.length,
    skipped: skipped.length,
    maxInside
  });
});

// ===== リセット =====
app.post("/admin/reset", (req, res) => {
  currentTicket = ticketStart;
  checkedIn = [];
  skipped = [];
  res.json({ status: "reset" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
