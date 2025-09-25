const express = require("express");
const rateLimit = require("express-rate-limit");
const basicAuth = require("express-basic-auth");
const { Server } = require("socket.io");
const http = require("http");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.use(bodyParser.json());

// ---- DDoS対策（user側のみ） ----
const userLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: "Too many requests, try again later."
});
app.use("/user", userLimiter);

// ---- 管理者認証 ----
let adminPassword = null;
app.use("/admin", (req, res, next) => {
  if (!adminPassword) {
    return res.send(`
      <form method="POST" action="/set-password">
        <input type="password" name="password" placeholder="新しいパスワードを設定">
        <button type="submit">決定</button>
      </form>
    `);
  }
  return basicAuth({
    users: { admin: adminPassword },
    challenge: true
  })(req, res, next);
});

app.post("/set-password", bodyParser.urlencoded({ extended: true }), (req, res) => {
  adminPassword = req.body.password;
  res.redirect("/admin");
});

// ---- 状態管理 ----
let currentNumber = 0;
let registeredUsers = {}; // {番号: socketId}
let exitedCount = 0;
let enteredCount = 0;
let callAhead = 3;

// ---- WebSocket ----
io.on("connection", (socket) => {
  console.log("User connected");

  // ユーザー登録
  socket.on("register", (num) => {
    registeredUsers[num] = socket.id;
  });

  socket.emit("update", { currentNumber, exitedCount, enteredCount });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

// ---- 管理者操作 ----
app.get("/admin/next", (req, res) => {
  currentNumber++;
  notifyUsers();
  io.emit("update", { currentNumber, exitedCount, enteredCount });
  res.redirect("/admin");
});

app.get("/admin/prev", (req, res) => {
  if (currentNumber > 0) currentNumber--;
  notifyUsers();
  io.emit("update", { currentNumber, exitedCount, enteredCount });
  res.redirect("/admin");
});

app.get("/admin/enter", (req, res) => {
  enteredCount++;
  io.emit("update", { currentNumber, exitedCount, enteredCount });
  res.redirect("/admin");
});

app.get("/admin/exit", (req, res) => {
  exitedCount++;
  io.emit("update", { currentNumber, exitedCount, enteredCount });
  res.redirect("/admin");
});

app.post("/admin/admin", (req, res) => {
  callAhead = parseInt(req.body.callAhead || "3");
  res.redirect("/admin");
});

// ---- 整理券発行 ----
app.post("/admin/tickets", async (req, res) => {
  const { start, end, url } = req.body;
  if (!start || !end || !url) {
    return res.status(400).json({ success: false });
  }

  const filePath = path.join(__dirname, "public", "tickets.pdf");
  const doc = new PDFDocument({ size: "A4", margin: 20 });
  doc.pipe(fs.createWriteStream(filePath));

  const perPage = 12;
  const width = 200;
  const height = 140;
  const cols = 3;
  const rows = 4;

  // --- 表面 ---
  let count = 0;
  for (let num = start; num <= end; num++) {
    const col = count % cols;
    const row = Math.floor(count / cols) % rows;

    const x = 40 + col * width;
    const y = 40 + row * height;

    // 枠
    doc.rect(x, y, width - 20, height - 20).stroke();
    doc.fontSize(20).text(`整理券 No.${num}`, x + 10, y + 10);

    // 利用者用QR
    const qrUser = await QRCode.toDataURL(`${url}?number=${num}`);
    doc.image(qrUser, x + 50, y + 40, { fit: [80, 80] });
    doc.fontSize(10).text("← 利用者用QR", x + 40, y + 125);

    count++;
    if (count % perPage === 0 && num < end) {
      doc.addPage();
    }
  }

  // --- 裏面 ---
  doc.addPage();
  count = 0;
  for (let num = start; num <= end; num++) {
    const col = count % cols;
    const row = Math.floor(count / cols) % rows;

    const x = 40 + col * width;
    const y = 40 + row * height;

    // 枠
    doc.rect(x, y, width - 20, height - 20).stroke();

    // チェックイン用QR
    const qrCheckin = await QRCode.toDataURL(`${num}`);
    doc.image(qrCheckin, x + 50, y + 40, { fit: [80, 80] });
    doc.fontSize(10).text("チェックインQR", x + 40, y + 125);

    count++;
    if (count % perPage === 0 && num < end) {
      doc.addPage();
    }
  }

  doc.end();
  res.json({ success: true, url: "/tickets.pdf" });
});

// ---- 通知処理 ----
function notifyUsers() {
  for (let [num, socketId] of Object.entries(registeredUsers)) {
    if (parseInt(num) === currentNumber + callAhead) {
      io.to(socketId).emit("notify", { message: `もうすぐ呼ばれます: No.${num}` });
    }
  }
}

server.listen(3000, () => {
  console.log("Server running http://localhost:3000");
});
