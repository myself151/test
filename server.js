const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const DATA_FILE = path.join(__dirname, "data.json");
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({ tickets: [], checkin: [], checkout: [], maxInside: 0 }));

// 管理者パスワード（admin/adminのみ）
let adminPassword = null;

// データ読み込み
const loadData = () => JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// --- 管理者設定画面 ---
app.get("/admin/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin.html"));
});

// パスワード設定
app.post("/admin/admin/set-password", (req, res) => {
  adminPassword = req.body.password;
  res.json({ ok: true });
});

// 最大人数設定
app.post("/admin/admin/set-max", (req, res) => {
  const data = loadData();
  data.maxInside = parseInt(req.body.maxInside);
  saveData(data);
  res.json({ ok: true });
});

// --- 整理券発行 ---
app.post("/admin/admin/issue", async (req, res) => {
  const { start, end, url } = req.body;
  const data = loadData();
  for (let num = start; num <= end; num++) data.tickets.push({ num, checkedIn: false });
  saveData(data);

  // PDF生成（表：整理券番号＋利用者用QR、裏：チェックイン用QR）
  const doc = new PDFDocument({ size: "A4" });
  const filePath = path.join(__dirname, "tickets.pdf");
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const perPage = 12;
  let count = 0;

  for (let ticket of data.tickets.slice(-((end-start)+1))) {
    const x = (count % 3) * 180 + 20;
    const y = Math.floor(count / 3) * 150 + 20;

    // 表面
    doc.font(path.join(__dirname, "NotoSansJP-ExtraBold.ttf")).fontSize(16)
       .text(`整理券番号: ${ticket.num}`, x, y);

    const qrDataUrl = await QRCode.toDataURL(`${url}?ticket=${ticket.num}`);
    const qrBuffer = Buffer.from(qrDataUrl.split(",")[1], "base64");
    doc.image(qrBuffer, x, y + 30, { width: 100, height: 100 });

    // 裏面
    doc.addPage();
    doc.font(path.join(__dirname, "NotoSansJP-ExtraBold.ttf")).fontSize(16)
       .text("チェックイン用", 50, 50);

    const qrCheckinUrl = await QRCode.toDataURL(`${ticket.num}`);
    const qrCheckinBuffer = Buffer.from(qrCheckinUrl.split(",")[1], "base64");
    doc.image(qrCheckinBuffer, 50, 80, { width: 100, height: 100 });

    count++;
    if (count % perPage === 0 && ticket.num < end) doc.addPage();
  }

  doc.end();
  stream.on("finish", () => res.json({ path: "/tickets.pdf" }));
});

// --- 入場カメラ（QR読み取り） ---
app.post("/admin/enter", (req, res) => {
  const { ticketNum } = req.body;
  const data = loadData();
  const ticket = data.tickets.find(t => t.num === ticketNum);
  if (ticket && !ticket.checkedIn) {
    ticket.checkedIn = true;
    data.checkin.push(ticketNum);
    saveData(data);
    res.json({ ok: true, msg: "お進み下さい" });
  } else {
    res.json({ ok: false, msg: "無効または既にチェックイン済" });
  }
});

// --- 退場カメラ ---
app.post("/admin/exit", (req, res) => {
  const { ticketNum } = req.body;
  const data = loadData();
  if (!data.checkout.includes(ticketNum)) data.checkout.push(ticketNum);
  saveData(data);
  res.json({ ok: true });
});

// --- 集計 ---
app.get("/admin/admin/stats", (req, res) => {
  const data = loadData();
  res.json({
    totalTickets: data.tickets.length,
    checkedIn: data.checkin.length,
    checkedOut: data.checkout.length,
  });
});

// --- リセット ---
app.post("/admin/admin/reset", (req, res) => {
  const data = loadData();
  data.tickets = [];
  data.checkin = [];
  data.checkout = [];
  saveData(data);
  res.json({ ok: true });
});

// --- 利用者側 ---
app.get("/user", (req, res) => res.sendFile(path.join(__dirname, "public/user/user.html")));
app.post("/user/notify", (req, res) => {
  // プッシュ通知処理（フロントでServiceWorker利用）
  res.json({ ok: true });
});

// サーバー起動
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
