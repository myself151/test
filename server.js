// server.js
const express = require("express");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const qr = require("qr-image");
const rateLimit = require("express-rate-limit");

const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

let tickets = [];            // 発行済整理券番号
let currentIndex = 0;        // 呼び出し番号インデックス
let maxVenue = 50;           // 場内最大人数
let notifyCount = 3;         // 通知人数
let adminPassword = "";       // 管理者パスワード
let checkedIn = [];           // チェックイン済番号
let checkedOut = [];          // チェックアウト済番号

// 1つのIPが5分間に100回以上アクセスしたらブロック（ユーザー側のみ）
const userLimiter = rateLimit({
  windowMs: 5*60*1000,
  max: 100,
  message: "Too many requests from this IP, try again after 5 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/user", userLimiter);

// --- 管理者パスワード設定 ---
app.post("/admin/setPassword",(req,res)=>{
  adminPassword = req.body.password || "";
  res.send({status:"ok"});
});

// --- 最大人数・通知人数設定 ---
app.post("/admin/setVenue",(req,res)=>{
  maxVenue = parseInt(req.body.maxVenue) || 50;
  notifyCount = parseInt(req.body.notifyCount) || 3;
  res.send({status:"ok"});
});

// --- 整理券発行 ---
app.post("/admin/issue",(req,res)=>{
  const start = parseInt(req.body.start);
  const end = parseInt(req.body.end);
  tickets = [];
  for(let i=start;i<=end;i++) tickets.push(i);
  currentIndex=0;
  checkedIn = [];
  checkedOut = [];

  // PDF生成
  const doc = new PDFDocument({size:'A4', margin:10});
  const fontPath = path.join(__dirname,'NotoSansJP-ExtraBold.ttf');
  doc.registerFont('NotoJP', fontPath);
  const cols=4, rows=3;
  const cellW = (595-20)/cols, cellH=(842-20)/rows;

  // --- 表面 ---
  let count = 0;
  tickets.forEach(num=>{
    const col = count%cols;
    const row = Math.floor(count/cols)%rows;
    const x = 10 + col*cellW;
    const y = 10 + row*cellH;
    doc.font('NotoJP').fontSize(10).text('こちらがURLです', x+5, y+5);
    doc.fontSize(20).text(num, x+cellW/2-10, y+30);
    const qrSvg = qr.imageSync(`${req.headers.host}/user?ticket=${num}`, {type:'png', margin:1, size:5});
    doc.image(qrSvg,x+10,y+60,{width:cellW-20,height:cellH-70});
    count++;
    if(count%(cols*rows)===0) doc.addPage();
  });

  doc.addPage(); // 裏面
  count=0;
  tickets.forEach(num=>{
    const col = count%cols;
    const row = Math.floor(count/cols)%rows;
    const x=10+col*cellW;
    const y=10+row*cellH;
    doc.font('NotoJP').fontSize(12).text('チェックイン用', x+5,y+5);
    const qrSvg = qr.imageSync(`${num}`,{type:'png',margin:1,size:5});
    doc.image(qrSvg,x+10,y+30,{width:cellW-20,height:cellH-40});
    count++;
    if(count%(cols*rows)===0) doc.addPage();
  });

  const filePath = path.join(__dirname,'tickets.pdf');
  doc.pipe(fs.createWriteStream(filePath));
  doc.end();
  doc.on('end',()=>res.download(filePath));
  res.download(filePath);
});

// --- 現在番号と通知番号取得 ---
app.get("/user/current",(req,res)=>{
  const current = tickets[currentIndex] || 0;
  const notify = tickets.slice(currentIndex, currentIndex+notifyCount);
  res.send({current,notify});
});

// --- チェックイン ---
app.post("/admin/checkin",(req,res)=>{
  const num = parseInt(req.body.ticket);
  if(!checkedIn.includes(num)) checkedIn.push(num);
  res.send({status:"ok"});
});

// --- チェックアウト ---
app.post("/admin/checkout",(req,res)=>{
  const num = parseInt(req.body.ticket);
  if(!checkedOut.includes(num)) checkedOut.push(num);
  res.send({status:"ok"});
});

// --- リセット ---
app.post("/admin/reset",(req,res)=>{
  tickets=[]; currentIndex=0;
  checkedIn=[]; checkedOut=[];
  res.send({status:"ok"});
});

// --- 集計 ---
app.get("/admin/aggregate",(req,res)=>{
  res.send({current:tickets[currentIndex]||0,checkedIn,checkedOut});
});

app.listen(3000,()=>console.log("Server running on http://localhost:3000"));
