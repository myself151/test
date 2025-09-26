const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const qr = require("qr-image");

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

let tickets = [];
let checkinList = [];
let checkoutList = [];
let currentNumber = 0;
let maxInside = 5;

// 整理券発行
app.post("/admin/issue", (req, res) => {
  const { start, end } = req.body;
  for (let i = start; i <= end; i++) {
    tickets.push(i);
  }
  updateCallNumber();
  res.json({ status: "ok", tickets });
});

// チェックイン
app.post("/admin/checkin", (req, res) => {
  const { ticket } = req.body;
  if (!checkinList.includes(ticket)) checkinList.push(ticket);
  updateCallNumber();
  res.json({ status: "checked-in" });
});

// チェックアウト
app.post("/admin/checkout", (req, res) => {
  const { ticket } = req.body;
  if (!checkoutList.includes(ticket)) checkoutList.push(ticket);
  updateCallNumber();
  res.json({ status: "checked-out" });
});

// 呼び出し番号更新
function updateCallNumber() {
  const exited = checkoutList.length;
  const inside = checkinList.length;
  currentNumber =
    exited + Math.min(maxInside, tickets.length - exited - inside);
}

// 現在の呼び出し番号取得
app.get("/user/current", (req, res) => {
  res.json({ current: currentNumber });
});

// 場内最大人数設定
app.post("/admin/setmax", (req, res) => {
  const { max } = req.body;
  maxInside = max;
  updateCallNumber();
  res.json({ status: "ok", maxInside });
});

// PDF整理券生成（破損しない方式）
app.post("/admin/pdf", (req, res) => {
  const { start, end, url } = req.body;
  const doc = new PDFDocument({ size: "A4" });
  const filePath = path.join(__dirname, "tickets.pdf");
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const perPage = 12;
  let numCount = 0;

  // 表面ページ
  for (let i = start; i <= end; i++) {
    const x = 50;
    const y = 50 + (numCount % perPage) * 60;

    doc.font(path.join(__dirname, "NotoSansJP-ExtraBold.ttf")).fontSize(14);
    doc.text(`番号: ${i}`, x, y);

    // 表面QR: URL
    const qrStream = qr.image(`${url}?ticket=${i}`, { type: "png" });
    doc.image(qrStream, x + 150, y, { width: 50, height: 50 });

    numCount++;
    if (numCount % perPage === 0 && i !== end) doc.addPage();
  }

  // 裏面ページ
  numCount = 0;
  doc.addPage();
  for (let i = start; i <= end; i++) {
    const x = 50;
    const y = 50 + (numCount % perPage) * 60;

    doc.font(path.join(__dirname, "NotoSansJP-ExtraBold.ttf")).fontSize(14);
    doc.text("チェックイン用", x, y);

    // 裏面QR: 番号
    const qrStream = qr.image(`${i}`, { type: "png" });
    doc.image(qrStream, x + 150, y, { width: 50, height: 50 });

    numCount++;
    if (numCount % perPage === 0 && i !== end) doc.addPage();
  }

  doc.end();
  stream.on("finish", () => res.download(filePath));
});

// 管理者パスワード保護
let adminPassword = null;
app.use("/admin/admin", (req, res, next) => {
  const pw = req.query.pw;
  if (!adminPassword) {
    if (pw) {
      adminPassword = pw;
      next();
    } else {
      return res.send(
        "管理者パスワードをURLパラメータで設定してください。例: /admin/admin?pw=XXXX"
      );
    }
  } else {
    if (pw === adminPassword) next();
    else return res.send("パスワード不正");
  }
});

// HTML配信
app.get("/admin/admin", (req, res) =>
  res.sendFile(path.join(__dirname, "public/admin/admin.html"))
);
app.get("/admin/enter", (req, res) =>
  res.sendFile(path.join(__dirname, "public/admin/enter.html"))
);
app.get("/admin/exit", (req, res) =>
  res.sendFile(path.join(__dirname, "public/admin/exit.html"))
);
app.get("/user", (req, res) =>
  res.sendFile(path.join(__dirname, "public/user/user.html"))
);

app.listen(3000, () =>
  console.log("Server running on http://localhost:3000")
);
