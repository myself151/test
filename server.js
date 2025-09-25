const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const QRCode = require('qrcode');
const fs = require('fs');
const PDFDocument = require('pdfkit');

const app = express();
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

let userStatus = {}; // { ticketNumber: { checkedIn, skipped, startTime } }
let calledIndex = 0;
let tickets = []; // 発行済み整理券番号
let maxVenue = 50;      // 場内最大人数
let notifyCount = 3;    // 呼び出し人数

// ------------------- 管理者設定 -------------------
// 管理者パスワード
let adminPassword = null;

// 管理者設定画面で場内人数＋呼び出し数を設定
app.post('/admin/setVenue', (req,res)=>{
  maxVenue = parseInt(req.body.maxVenue);
  notifyCount = parseInt(req.body.notifyCount);
  res.json({ok:true});
});

// ------------------- 整理券発行 -------------------
app.post('/admin/issue', async (req,res)=>{
  const start = parseInt(req.body.start);
  const end = parseInt(req.body.end);
  tickets = [];
  for(let i=start;i<=end;i++){
    tickets.push(i);
    userStatus[i] = { checkedIn:false, skipped:false, startTime:null };
  }

  const doc = new PDFDocument({ size: 'A4', margin: 20 });
  const filePath = path.join(__dirname,'ticket.pdf');
  doc.pipe(fs.createWriteStream(filePath));

  for(let i=0;i<tickets.length;i++){
    if(i>0) doc.addPage();
    const number = tickets[i];

    // 表面: 番号 + URL QR
    doc.font('public/fonts/NotoSansJP-ExtraBold.ttf').fontSize(20).text(`整理券番号: ${number}`,50,50);
    const urlQR = await QRCode.toDataURL(`https://your-site.com/user?ticket=${number}`);
    doc.image(urlQR, 50, 100, { width: 100, height: 100 });

    // 裏面: チェックインQR
    doc.addPage();
    doc.fontSize(20).text(`チェックイン用`,50,50);
    const qrCheck = await QRCode.toDataURL(`${number}`);
    doc.image(qrCheck,50,100,{width:100,height:100});
  }

  doc.end();
  res.json({ok:true,file:'ticket.pdf'});
});

// ------------------- チェックイン -------------------
app.post('/admin/checkin',(req,res)=>{
  const ticket = req.body.ticket;
  if(userStatus[ticket]){
    userStatus[ticket].checkedIn = true;
    userStatus[ticket].startTime = Date.now();
    res.json({ok:true});
  }else res.json({ok:false});
});

// ------------------- 退場チェックアウト -------------------
app.post('/admin/checkout',(req,res)=>{
  const ticket = req.body.ticket;
  if(userStatus[ticket] && userStatus[ticket].checkedIn){
    userStatus[ticket].checkedIn = false;
    res.json({ok:true});
  }else res.json({ok:false});
});

// ------------------- 呼び出し番号 -------------------
app.get('/user/current',(req,res)=>{
  const activeTickets = tickets.filter(t=>!userStatus[t].skipped);
  const nextIndex = Math.min(calledIndex + notifyCount, activeTickets.length);
  const notifyList = activeTickets.slice(calledIndex,nextIndex);
  res.json({current:activeTickets[calledIndex]||null, notify:notifyList});
});

// ------------------- スキップ処理 -------------------
app.post('/admin/skip',(req,res)=>{
  const ticket = req.body.ticket;
  if(userStatus[ticket]) userStatus[ticket].skipped = true;
  res.json({ok:true});
});

// ------------------- リセット -------------------
app.post('/admin/reset',(req,res)=>{
  userStatus={};
  calledIndex=0;
  tickets=[];
  res.json({ok:true});
});

app.listen(3000,()=>console.log('Server running on http://localhost:3000'));
