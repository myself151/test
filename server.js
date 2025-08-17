const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const auth = require("basic-auth");
const cors = require("cors");
require("dotenv").config();

const app = express();
const server = http.createServer(app);

const allowList = (process.env.ALLOWED_ORIGINS || "")
.split(",").map(s => s.trim()).filter(Boolean);

app.use(cors({
origin: (origin, cb) => {
if (!origin) return cb(null, true);
if (allowList.length === 0 || allowList.includes(origin)) return cb(null, true);
return cb(new Error("Not allowed by CORS"), false);
}
}));

const io = new Server(server, {
cors: { origin: allowList.length ? allowList : true, methods: ["GET","POST"] }
});

let currentNumber = 0;

const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASS = process.env.ADMIN_PASS || "secret123";

app.use("/admin", (req,res,next)=>{
const user = auth(req);
if(user && user.name===ADMIN_USER && user.pass===ADMIN_PASS) return next();
res.set("WWW-Authenticate",'Basic realm="Admin Area"');
return res.status(401).send("管理者認証が必要です");
});

app.use(express.static("public"));

app.get("/admin",(req,res)=>res.sendFile(__dirname+"/public/admin.html"));
app.get("/user",(req,res)=>res.sendFile(__dirname+"/public/user.html"));

io.on("connection", (socket)=>{
socket.emit("updateNumber", currentNumber);

socket.on("next",()=>{ currentNumber++; io.emit("updateNumber",currentNumber); });
socket.on("prev",()=>{ if(currentNumber>0) currentNumber--; io.emit("updateNumber",currentNumber); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT,()=>console.log(`Server on http://0.0.0.0:${PORT}`));
