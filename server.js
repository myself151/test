const express = require("express");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const PDFDocument = require("pdfkit");
const qrcode = require("qrcode");

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json());

// データファイル
const dataFile = path.join(__dirname, "data.json");
function readData() {
  if (!fs.existsSync(dataFile)) {
    const init = { currentNumber:0, distributed:[], checkedIn:0, checkedOut:0, maxCapacity:20 };
    fs.writeFileSync(dataFile, JSON.stringify(init,null,2));
  }
  return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
}
function writeData(data) {
  fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), "utf-8");
}

// ===== ルート・画面への GET =====
app.get("/", (req, res) => res.redirect("/user"));
app.get("/user", (req,res) => res.sendFile(path.join(__dirname,"public/user/user.html")));
app.get("/admin/admin", (req,res) => res.sendFile(path.join(__dirname,"public/admin/admin.html")));
app.get("/admin/enter", (req,res) => res.sendFile(path.join(__dirname,"public/admin/enter.html")));
app.get("/admin/exit", (req,res) => res.sendFile(path.join(__dirname,"public/admin/exit.html")));

// ===== PDF生成（両面・日本語対応） =====
app.post("/admin/pdf", async (req,res) => {
  try {
    const { start, end, url } = req.body;
    const filePath = path.join(__dirname, "tickets.pdf");
    const doc = new PDFDocument({ size:"A4", margin:30, autoFirstPage:false });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const fontPath = path.join(__dirname,"NotoSansJP-ExtraBold.ttf");
    doc.registerFont("JP", fontPath);

    const perPage = 12;
    const cols = 2;
    const rows = 6;
    const ticketWidth = 250;
    const ticketHeight = 120;
    let count = 0;

    for(let num=start; num<=end; num++){
      // 表
      if(count%perPage===0) doc.addPage();
      const col = count % cols;
      const row = Math.floor((count % perPage)/cols);
      const x = 50 + col*(ticketWidth+20);
      const y = 50 + row*(ticketHeight+20);

      const qrDataUrl = await qrcode.toDataURL(`${url}?number=${num}`);
      const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.rect(x,y,ticketWidth,ticketHeight).stroke();
      doc.image(qrBuffer,x+10,y+10,{width:80,height:80});
      doc.font("JP").fontSize(18).text(`整理券番号: ${num}`,x+100,y+40);

      // 裏
      const backX = x;
      const backY = y + ticketHeight + 10;
      const qrBack = await qrcode.toDataURL(`${num}`);
      const qrBackBuf = Buffer.from(qrBack.replace(/^data:image\/png;base64,/, ""), "base64");
      doc.rect(backX,backY,ticketWidth,ticketHeight).stroke();
      doc.image(qrBackBuf,backX+10,backY+10,{width:80,height:80});
      doc.font("JP").fontSize(18).text(`チェックイン用`, backX+100, backY+40);

      count++;
    }

    doc.end();
    stream.on("finish",()=>res.download(filePath,"tickets.pdf"));
  } catch(e){
    console.error(e);
    res.status(500).send("PDF生成に失敗しました");
  }
});

// ===== 管理者操作 =====
app.post("/admin/reset", (req,res)=>{
  const data = { currentNumber:0, distributed:[], checkedIn:0, checkedOut:0, maxCapacity:20 };
  writeData(data);
  res.json({ok:true});
});

app.get("/admin/stats",(req,res)=>{
  const data = readData();
  res.json({
    distributed:data.distributed,
    checkedIn:data.checkedIn,
    checkedOut:data.checkedOut,
    maxCapacity:data.maxCapacity,
    currentNumber:data.currentNumber
  });
});

app.post("/admin/setmax",(req,res)=>{
  const { max } = req.body;
  const data = readData();
  data.maxCapacity = max;
  writeData(data);
  res.json({ok:true});
});

app.post("/admin/distribute",(req,res)=>{
  const { number } = req.body;
  const data = readData();
  const n = Number(number);
  if(!data.distributed.includes(n)){
    data.distributed.push(n);
    if(n>data.currentNumber) data.currentNumber=n;
    writeData(data);
  }
  res.json({ok:true});
});

// ===== 入退場 =====
app.post("/enter",(req,res)=>{
  const { number } = req.body;
  const data = readData();
  if(data.distributed.includes(Number(number))){
    data.checkedIn++;
    writeData(data);
    res.json({ok:true});
  } else res.status(400).json({error:"未配布番号"});
});

app.post("/exit",(req,res)=>{
  const { number } = req.body;
  const data = readData();
  if(data.distributed.includes(Number(number))){
    data.checkedOut++;
    writeData(data);
    res.json({ok:true});
  } else res.status(400).json({error:"未配布番号"});
});

app.listen(PORT,()=>console.log(`✅ サーバー起動 http://localhost:${PORT}`));
// ...前略（express, fs, path, bodyParser, PDFKit, qrcodeの読み込みと設定）...

// PDF生成（両面・表と裏を分離）
app.post("/admin/pdf", async (req,res)=>{
  try{
    const { start, end, url } = req.body;
    const filePath = path.join(__dirname,"tickets.pdf");
    const doc = new PDFDocument({ size:"A4", margin:30, autoFirstPage:false });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const fontPath = path.join(__dirname,"NotoSansJP-ExtraBold.ttf");
    doc.registerFont("JP", fontPath);

    const perPage = 12;
    const cols = 2;
    const rows = 6;
    const ticketWidth = 250;
    const ticketHeight = 120;

    let count=0;
    for(let num=start; num<=end; num++){
      // ===== 表面 =====
      if(count%perPage===0) doc.addPage();
      const col = count%cols;
      const row = Math.floor((count%perPage)/cols);
      const x = 50 + col*(ticketWidth+20);
      const y = 50 + row*(ticketHeight+20);

      const qrDataUrl = await qrcode.toDataURL(`${url}?number=${num}`);
      const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""),"base64");

      doc.rect(x,y,ticketWidth,ticketHeight).stroke();
      doc.image(qrBuffer,x+10,y+10,{width:80,height:80});
      doc.font("JP").fontSize(18).text(`整理券番号: ${num}`,x+100,y+40);

      // ===== 裏面 =====
      // 表と同じページに描画すると重なるため、次ページに配置
      doc.addPage();
      const backX = 50;
      const backY = 50;
      const qrBackUrl = await qrcode.toDataURL(`${num}`);
      const qrBackBuf = Buffer.from(qrBackUrl.replace(/^data:image\/png;base64,/, ""),"base64");

      doc.rect(backX,backY,ticketWidth,ticketHeight).stroke();
      doc.image(qrBackBuf,backX+10,backY+10,{width:80,height:80});
      doc.font("JP").fontSize(18).text(`チェックイン用`,backX+100,backY+40);

      count++;
    }

    doc.end();
    stream.on("finish",()=>res.download(filePath,"tickets.pdf"));

  }catch(e){
    console.error(e);
    res.status(500).send("PDF生成に失敗しました");
  }
});
// ルートアクセス時にユーザー画面へリダイレクト
app.get("/", (req, res) => res.redirect("/user/user.html"));
// 管理者UI
app.get("/admin/admin", (req, res) => res.sendFile(path.join(__dirname, "public/admin/admin.html")));
// 整理券発行（入力方式：サーバーに番号保持せず配布済みを入力）
app.post("/admin/issue", (req, res) => {
  const { start, end } = req.body;
  const data = readData();
  for (let num = Number(start); num <= Number(end); num++) {
    if (!data.distributed.includes(num)) data.distributed.push(num);
    data.currentNumber = Math.max(data.currentNumber, num);
  }
  writeData(data);
  res.json({ ok: true, currentNumber: data.currentNumber });
});
// 管理者画面から最大人数を設定
app.post("/admin/setMax", (req, res) => {
  const { max } = req.body;
  const data = readData();
  data.maxCapacity = Number(max);
  writeData(data);
  res.json({ ok: true });
});
// PDF生成
app.post("/admin/pdf", async (req, res) => {
  try {
    const { start, end, url } = req.body;
    const filePath = path.join(__dirname, "tickets.pdf");
    const doc = new PDFDocument({ size: "A4", margin: 30, autoFirstPage: false });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
    doc.registerFont("JP", fontPath);

    const perPage = 12;
    const cols = 2;
    const rows = 6;
    const ticketWidth = 250;
    const ticketHeight = 120;
    let count = 0;

    for (let num = start; num <= end; num++) {
      if (count % perPage === 0) doc.addPage();
      const col = count % cols;
      const row = Math.floor((count % perPage) / cols);
      const x = 50 + col * (ticketWidth + 20);
      const y = 50 + row * (ticketHeight + 20);

      const qrDataUrl = await qrcode.toDataURL(`${url}?number=${num}`);
      const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/png;base64,/, ""), "base64");

      doc.rect(x, y, ticketWidth, ticketHeight).stroke();
      doc.image(qrBuffer, x + 10, y + 10, { width: 80, height: 80 });
      doc.font("JP").fontSize(18).text(`整理券番号: ${num}`, x + 100, y + 40);

      count++;
    }

    doc.end();
    stream.on("finish", () => res.download(filePath, "tickets.pdf"));
  } catch (e) {
    console.error("PDF生成エラー:", e);
    res.status(500).send("PDF生成に失敗しました");
  }
});
// ルート → ユーザー画面
app.get("/", (req, res) => res.redirect("/user/user.html"));

// 管理画面
app.get("/admin/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public/admin/admin.html"));
});

// 利用者画面
app.get("/user/user", (req, res) => {
  res.sendFile(path.join(__dirname, "public/user/user.html"));
});
// 現在の呼び出し番号・場内人数・最大人数を返す
app.get("/status", (req, res) => {
  const data = readData();
  res.json({
    currentNumber: data.currentNumber,
    inside: data.inside,
    maxCapacity: data.maxCapacity
  });
});
// 整理券発行（開始番号と終了番号）
app.post("/admin/admin/issue", (req, res) => {
  const { start, end } = req.body;
  const data = readData();
  for (let num = Number(start); num <= Number(end); num++) {
    if (!data.distributed.includes(num)) data.distributed.push(num);
    data.currentNumber = Math.max(data.currentNumber, num);
  }
  writeData(data);
  res.json({ ok: true, currentNumber: data.currentNumber });
});

// 最大人数設定
app.post("/admin/admin/setMax", (req, res) => {
  const { max } = req.body;
  const data = readData();
  data.maxCapacity = Number(max);
  writeData(data);
  res.json({ ok: true });
});

// 配布データ・人数リセット
app.post("/admin/admin/reset", (req, res) => {
  const data = readData();
  data.distributed = [];
  data.currentNumber = 0;
  data.inside = 0;
  writeData(data);
  res.json({ ok: true });
});
app.post("/admin/admin/pdf", async (req, res) => {
  // 先ほどのPDF生成処理と同一、URLだけ /admin/admin に変更
});
// チェックイン
app.post("/enter", (req, res) => {
  const { number } = req.body;
  const data = readData();

  if (!data.distributed.includes(Number(number))) {
    return res.status(400).json({ error: "未配布の番号です" });
  }

  if (data.inside >= data.maxCapacity) {
    return res.status(400).json({ error: "場内が満員です" });
  }

  data.inside++;
  writeData(data);
  res.json({ ok: true });
});

// チェックアウト
app.post("/exit", (req, res) => {
  const data = readData();
  data.inside = Math.max(0, data.inside - 1);
  writeData(data);
  res.json({ ok: true });
});

