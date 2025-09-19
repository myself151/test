const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static("public"));

// 現在番号
let currentNumber = 0;

// user 側のアクセス制限（DDoS対策）
const userLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5分
  max: 100,
  message: "Too many requests, try again after 5 minutes.",
});
app.use("/user", userLimiter);

// --- API for client polling ---
app.get("/api/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ currentNumber });
});

// --- 管理者操作 ---
app.post("/admin/next", (req, res) => {
  currentNumber++;
  console.log("Next number:", currentNumber);
  io.emit("update", { currentNumber });
  res.json({ currentNumber });
});

app.post("/admin/prev", (req, res) => {
  currentNumber = Math.max(0, currentNumber - 1);
  console.log("Prev number:", currentNumber);
  io.emit("update", { currentNumber });
  res.json({ currentNumber });
});

// --- Socket.io connection ---
io.on("connection", (socket) => {
  socket.emit("update", { currentNumber });
});

// --- HTML提供 ---
app.get("/admin", (req, res) => res.sendFile(__dirname + "/public/admin.html"));
app.get("/user", (req, res) => res.sendFile(__dirname + "/public/user.html"));

// --- サーバー起動 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
// 既存コードはそのまま

// ユーザー番号を保持（必要であれば配列管理）
let userNumbers = []; // 今回は番号を登録した利用者リストとして仮置き

// --- 管理者操作の next に通知判定を追加 ---
app.post("/admin/next", (req, res) => {
  currentNumber++;
  console.log("Next number:", currentNumber);

  io.emit("update", { currentNumber });

  // 通知判定
  // userNumbers に登録済みの番号で、currentNumber +5になったら通知
  userNumbers.forEach((num) => {
    if (currentNumber === num - 5) {
      io.emit("notify", { number: num });
    }
  });

  res.json({ currentNumber });
});

// --- API for user to register their number ---
app.post("/user/register", (req, res) => {
  const { number } = req.body;
  if (!userNumbers.includes(number)) {
    userNumbers.push(number);
  }
  res.json({ success: true });
});
