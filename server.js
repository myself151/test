const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const rateLimit = require("express-rate-limit");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static("public"));

// 番号保持
let currentNumber = 0;

// user 側のアクセス制限
const userLimiter = rateLimit({
windowMs: 5 * 60 * 1000,
max: 100,
message: "Too many requests, try again after 5 minutes",
});
app.use("/user", userLimiter);

// --- API for polling ---
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

// --- Socket.io接続 ---
io.on("connection", (socket) => {
socket.emit("update", { currentNumber });
});

// --- ページ提供 ---
app.get("/admin", (req, res) => res.sendFile(__dirname + "/public/admin.html"));
app.get("/user", (req, res) => res.sendFile(__dirname + "/public/user.html"));

server.listen(3000, () => console.log("Server running on http://localhost:3000"));
