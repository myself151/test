const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const qr = require('qr-image');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- データ ---
let tickets = [];
let currentIndex = 0;
let notifyCount = 3;
let insideCount = 0;
let maxVenue = 50;
let adminPassword = null;

// --- フォント（サーバー直下） ---
const FONT_PATH = path.join(__dirname,'NotoSansJP-ExtraBold.ttf');

// --- ルート ---
app.get('/',(req,res)=>res.send('整理券システム'));

// --- 管理者画面 ---
app.get('/admin/admin', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public/admin/admin.html'));
});
app.get('/admin/enter', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public/admin/enter.html'));
});
app.get('/admin/exit', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public/admin/exit.html'));
});

// --- 利用者画面 ---
app.get('/user',(req,res)=>{
  res.sendFile(path.join(__dirname,'public/user/user.html'));
});

// --- パスワード設定 ---
app.post('/admin/setPassword', (req,res)=>{
  adminPassword = req.body.password;
  res.json({ok:true});
});

// --- 施設設定 ---
app.post('/admin/setVenue', (req,res)=>{
  maxVenue = parseInt(req.body.maxVenue);
  notifyCount = parseInt(req.body.notifyCount);
  res.json({ok:true});
});

// --- 整理券発行 ---
app.post('/admin/issue', (req,res)=>{
  const start = parseInt(req.body.start);
  const end = parseInt(req.body.end);
  tickets = [];
  for(let i=start;i<=end;i++) tickets.push(i);
  currentIndex = 0;

  // PDF生成
  const pdfPath = path.join(__dirname,'ticket.pdf');
  const doc = new PDFDocument({size:'A4',margin:20});
  const writeStream = fs.createWriteStream(pdfPath);
  doc.pipe(writeStream);

  for(let i=0;i<tickets.length;i++){
    const t = tickets[i];
    // 表面
    doc.font(FONT_PATH).fontSize(20).text(`整理券番号: ${t}`,50,50);
    const qrSite = qr.imageSync(`https://your-site.com/user?ticket=${t}`,{type:'png'});
    doc.image(qrSite,50,100,{width:100,height:100});
    doc.addPage();
    // 裏面
    doc.font(FONT_PATH).fontSize(20).text('チェックイン用',50,50);
    const qrCheckin = qr.imageSync(`${t}`,{type:'png'});
    doc.image(qrCheckin,50,100,{width:100,height:100});
    if(i<tickets.length-1) doc.addPage();
  }

  doc.end();
  writeStream.on('finish',()=>res.json({ok:true,file:'ticket.pdf'}));
});

// --- 集計・リセット ---
app.post('/admin/reset',(req,res)=>{
  currentIndex = 0;
  tickets = [];
  insideCount = 0;
  res.json({ok:true});
});

// --- 現在呼び出し番号 ---
app.get('/user/current',(req,res)=>{
  const notify = [];
  for(let i=currentIndex;i<currentIndex+notifyCount && i<tickets.length;i++){
    notify.push(tickets[i]);
  }
  res.json({current:tickets[currentIndex]||null,notify});
});

// --- チェックイン ---
app.post('/admin/checkin',(req,res)=>{
  const t = parseInt(req.body.ticket);
  if(tickets.includes(t)){
    currentIndex = Math.max(currentIndex, tickets.indexOf(t)+1);
    insideCount = Math.min(insideCount+1,maxVenue);
    res.json({ok:true});
  } else res.json({ok:false});
});

// --- チェックアウト ---
app.post('/admin/checkout',(req,res)=>{
  const t = parseInt(req.body.ticket);
  insideCount = Math.max(0, insideCount-1);
  res.json({ok:true});
});

// --- サーバー起動 ---
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log(`Server running on port ${PORT}`));
