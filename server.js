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

// 登録済み番号（通知用）
let userNumbers = [];

// DDoS対策
const userLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  message: "Too many requests, try again after 5 minutes.",
});
app.use("/user", userLimiter);

// API: 現在番号取得
app.get("/api/status", (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json({ currentNumber });
});

// API: ユーザー番号登録
app.post("/user/register", (req, res) => {
  const { number } = req.body;
  if (!number) return res.status(400).json({ success: false });
  if (!userNumbers.includes(number)) userNumbers.push(number);
  res.json({ success: true });
});

// 管理者操作
app.post("/admin/next", (req, res) => {
  currentNumber++;
  console.log("Next number:", currentNumber);

  io.emit("update", { currentNumber });

  // 通知判定: 番号が5つ前になったら通知
  userNumbers.forEach((num) => {
    if (currentNumber === num - 5) {
      io.emit("notify", { number: num });
    }
  });

  res.json({ currentNumber });
});

app.post("/admin/prev", (req, res) => {
  currentNumber = Math.max(0, currentNumber - 1);
  io.emit("update", { currentNumber });
  res.json({ currentNumber });
});

// Socket.io接続
io.on("connection", (socket) => {
  console.log("WebSocket接続:", socket.id);
  socket.emit("update", { currentNumber });
});

// HTML提供
app.get("/admin", (req, res) => res.sendFile(__dirname + "/public/admin.html"));
app.get("/user", (req, res) => res.sendFile(__dirname + "/public/user.html"));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
