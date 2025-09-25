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

// Rate limit for user side
const userLimiter = rateLimit({
  windowMs: 5*60*1000,
  max: 100,
  message: "Too many requests from this IP, try again after 5 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/user", userLimiter);

// Global state
let tickets = [];
let currentIndex = 0;
let maxVenue = 50;
let notifyCount = 3;
let adminPassword = "";
let checkedIn = [];
let checkedOut = [];

// --- Serve static HTML files ---
app.get("/admin/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin.html"));
});
app.get("/admin/enter", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/enter.html"));
});
app.get("/admin/exit", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/exit.html"));
});
app.get("/user", (req, res) => {
  res.sendFile(path.join(__dirname, "public/user/user.html"));
});

// --- Set admin password ---
app.post("/admin/setPassword",(req,res)=>{
  adminPassword = req.body.password || "";
  res.send({status:"ok"});
});

// --- Set venue and notification count ---
app.post("/admin/setVenue",(req,res)=>{
  maxVenue = parseInt(req.body.maxVenue) || 50;
  notifyCount = parseInt(req.body.notifyCount) || 3;
  res.send({status:"ok"});
});

// --- Issue tickets and generate PDF ---
app.post("/admin/issue",(req,res)=>{
  const start = parseInt(req.body.start);
  const end = parseInt(req.body.end);
  tickets = [];
  for(let i=start;i<=end;i++) tickets.push(i);
  currentIndex=0;
  checkedIn = [];
  checkedOut = [];

  const doc = new PDFDocument({size:'A4', margin:10});
  const fontPath = path.join(__dirname,'NotoSansJP-ExtraBold.ttf');
  doc.registerFont('NotoJP', fontPath);
  const cols=4, rows=3;
  const cellW = (595-20)/cols, cellH=(842-20)/rows;

  // 表面
  let count=0;
  tickets.forEach(num=>{
    const col=count%cols;
    const row=Math.floor(count/cols)%rows;
    const x=10+col*cellW;
    const y=10+row*cellH;
    doc.font('NotoJP').fontSize(10).text('こちらがURLです',x+5,y+5);
    doc.fontSize(20).text(num,x+cellW/2-10,y+30);
    const qrSvg=qr.imageSync(`${req.headers.host}/user?ticket=${num}`,{type:'png',margin:1,size:5});
    doc.image(qrSvg,x+10,y+60,{width:cellW-20,height:cellH-70});
    count++;
    if(count%(cols*rows)===0) doc.addPage();
  });

  // 裏面
  doc.addPage();
  count=0;
  tickets.forEach(num=>{
    const col=count%cols;
    const row=Math.floor(count/cols)%rows;
    const x=10+col*cellW;
    const y=10+row*cellH;
    doc.font('NotoJP').fontSize(12).text('チェックイン用',x+5,y+5);
    const qrSvg=qr.imageSync(`${num}`,{type:'png',margin:1,size:5});
    doc.image(qrSvg,x+10,y+30,{width:cellW-20,height:cellH-40});
    count++;
    if(count%(cols*rows)===0) doc.addPage();
  });

  const filePath = path.join(__dirname,'tickets.pdf');
  doc.pipe(fs.createWriteStream(filePath));
  doc.end();
  res.download(filePath);
});

// --- Current number & notification list ---
app.get("/user/current",(req,res)=>{
  const current = tickets[currentIndex] || 0;
  const notify = tickets.slice(currentIndex,currentIndex+notifyCount);
  res.send({current,notify});
});

// --- Check-in / Check-out ---
app.post("/admin/checkin",(req,res)=>{
  const num=parseInt(req.body.ticket);
  if(!checkedIn.includes(num)) checkedIn.push(num);
  res.send({status:"ok"});
});
app.post("/admin/checkout",(req,res)=>{
  const num=parseInt(req.body.ticket);
  if(!checkedOut.includes(num)) checkedOut.push(num);
  res.send({status:"ok"});
});

// --- Reset & Aggregate ---
app.post("/admin/reset",(req,res)=>{
  tickets=[]; currentIndex=0;
  checkedIn=[]; checkedOut=[];
  res.send({status:"ok"});
});
app.get("/admin/aggregate",(req,res)=>{
  res.send({current:tickets[currentIndex]||0,checkedIn,checkedOut});
});

app.listen(3000,()=>console.log("Server running on http://localhost:3000"));
