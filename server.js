// server.js (フル版)
// 完全機能：発券・呼び出し管理・チェックイン/チェックアウト・キャンセル・PDF(12分割 両面)・管理者PW・静的配信
const express = require("express");
const fs = require("fs");
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");

const app = express();
const PORT = process.env.PORT || 3000;

// --- paths (絶対パス)
const DATA_FILE = path.join(__dirname, "data.json");
const FONT_PATH = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
const PDF_OUTPUT = path.join(__dirname, "tickets.pdf");

// --- ミドルウェア
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // public を静的配信

// --- data.json の初期化/読み書き
function ensureDataFile() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = {
      issued: [],        // 発行された整理券番号の配列（昇順）
      calledIndex: 0,    // 発行配列における呼び出された個数 (0ならまだ誰も呼ばれていない)
      checkedIn: [],     // チェックイン済み番号（配列）
      checkedOut: [],    // チェックアウト済み番号（配列）
      canceled: [],      // キャンセルされた番号（配列）
      maxInside: 10,     // 場内最大人数（admin/adminで変更可能）
      notifyAhead: 5,    // 通知する「何個前か」（利用者通知用、例：5つ前）
      adminPassword: null, // 管理者パスワード（初回アクセスで設定）
      logs: []           // 操作ログ（簡易）
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
  }
}
function readData() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}
function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- ユーティリティ
function uniquePush(arr, v) {
  if (!arr.includes(v)) arr.push(v);
}
function removeFrom(arr, v) {
  const i = arr.indexOf(v);
  if (i !== -1) arr.splice(i, 1);
}
function insideCount(data) {
  // inside = number of checkedIn that are not checkedOut and not canceled
  const insideSet = new Set();
  for (const n of data.checkedIn) {
    if (!data.checkedOut.includes(n) && !data.canceled.includes(n)) insideSet.add(n);
  }
  return insideSet.size;
}
function logOp(data, msg) {
  const ts = new Date().toISOString();
  data.logs = data.logs || [];
  data.logs.push({ ts, msg });
  // keep logs reasonable length
  if (data.logs.length > 1000) data.logs.shift();
}

// --- 呼び出しインデックス更新ロジック ---
// 目的：場内 (insideCount) が maxInside 未満なら、issued の未呼出し番号を呼出す（calledIndex を増やす）
// calledIndex = 発行配列のうち何件目まで"呼び出し済み"か（例: calledIndex=3 なら issued[0..2] が呼出し対象）
function refillCalledIndex(data) {
  let inside = insideCount(data);
  // calledCount should be at least number of people currently inside, normally greater or equal
  // Increase calledIndex while we have room inside < maxInside and there are uncalled issued numbers
  while (data.calledIndex < data.issued.length && inside < data.maxInside) {
    data.calledIndex += 1; // call next number
    inside = insideCount(data);
  }
  // no decrease of calledIndex automatically here; skipping handled manually if needed
}

// --- 管理用中間API: パスワード保護ミドルウェア（admin/admin の表示に使用） ---
// 初回アクセス時：?pw=xxx を付ければ adminPassword を設定（簡易）。その後は同じ ?pw=xxx を付けてアクセス。
// もしフロントでログイン UI を作るなら /api/admin/login エンドポイントを作ってトークン管理するのが望ましい。
function requireAdminPw(req, res, next) {
  const data = readData();
  const pwQuery = req.query.pw;
  if (!data.adminPassword) {
    if (pwQuery) {
      data.adminPassword = pwQuery;
      writeData(data);
      logOp(data, `admin password set via query`);
      return next();
    } else {
      return res.status(403).send("管理者パスワード未設定です。初回アクセス時は ?pw=あなたのパスワード を URL に付けてください。");
    }
  } else {
    if (pwQuery && pwQuery === data.adminPassword) return next();
    // allow POST /api/admin/setPassword to change with old password verification? For simplicity require query on admin page.
    return res.status(403).send("管理者パスワードが必要です。URL に ?pw=... を付けてください。");
  }
}

// --- HTML ルート（管理UIなど） ---
app.get("/admin/admin", requireAdminPw, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "admin.html"));
});
app.get("/admin/enter", requireAdminPw, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "enter.html"));
});
app.get("/admin/exit", requireAdminPw, (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "exit.html"));
});
app.get("/user/user", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "user", "user.html"));
});

// --- API: 状態取得 ---
app.get("/api/status", (req, res) => {
  const data = readData();
  // compute notify list (next notifyAhead numbers starting at calledIndex)
  const notify = data.issued.slice(data.calledIndex, data.calledIndex + data.notifyAhead);
  const current = data.issued[data.calledIndex] || null;
  res.json({
    issued: data.issued,
    calledIndex: data.calledIndex,
    current,
    notify,
    checkedIn: data.checkedIn,
    checkedOut: data.checkedOut,
    canceled: data.canceled,
    maxInside: data.maxInside,
    inside: insideCount(data),
    notifyAhead: data.notifyAhead,
    logs: data.logs || []
  });
});

// --- API: 発券（発行） ---
// Accepts { start, end } OR { count }.
// If start & end provided, will add those numbers if not present (useful for batch specific numbers).
// If count provided, will issue next count sequential numbers.
app.post("/api/issue", (req, res) => {
  const data = readData();
  const { start, end, count } = req.body;
  if (start != null && end != null) {
    for (let n = Number(start); n <= Number(end); n++) {
      if (!data.issued.includes(n)) data.issued.push(n);
    }
    data.issued.sort((a,b)=>a-b);
    logOp(data, `issued range ${start}-${end}`);
  } else if (count != null) {
    let last = data.issued.length ? Math.max(...data.issued) : 0;
    for (let i=0;i<count;i++){
      last++;
      data.issued.push(last);
    }
    logOp(data, `issued ${count} tickets`);
  } else {
    return res.status(400).json({ error: "start/end or count required" });
  }

  // after issue, try to refill calls up to capacity
  refillCalledIndex(data);
  writeData(data);
  res.json({ issued: data.issued, calledIndex: data.calledIndex });
});

// --- API: チェックイン（管理者の enter カメラから呼ばれる） ---
// { ticket: number }
app.post("/api/checkin", (req, res) => {
  const data = readData();
  const ticket = Number(req.body.ticket);
  if (!data.issued.includes(ticket)) return res.status(400).json({ ok:false, msg:"未発券の番号" });
  if (data.canceled.includes(ticket)) return res.status(400).json({ ok:false, msg:"キャンセル済み" });
  if (!data.checkedIn.includes(ticket)) {
    data.checkedIn.push(ticket);
    logOp(data, `checked in ${ticket}`);
  }
  // after someone checks in, refill calls if capacity allows more callers
  refillCalledIndex(data);
  writeData(data);
  res.json({ ok:true, inside: insideCount(data) });
});

// --- API: チェックアウト（管理者の exit カメラから呼ばれる） ---
// { ticket: number }
app.post("/api/checkout", (req, res) => {
  const data = readData();
  const ticket = Number(req.body.ticket);
  if (!data.checkedIn.includes(ticket)) {
    // allow checkout only if was checked-in; but we still record attempted checkout.
    // we'll still add to checkedOut to avoid repeated calls.
  }
  if (!data.checkedOut.includes(ticket)) {
    data.checkedOut.push(ticket);
    logOp(data, `checked out ${ticket}`);
  }
  // on checkout, we can advance calledIndex to bring in more waiting people
  refillCalledIndex(data);
  writeData(data);
  res.json({ ok:true, inside: insideCount(data), calledIndex: data.calledIndex });
});

// --- API: キャンセル（利用者が表QRを読み取って自動キャンセル） ---
// { ticket }
app.post("/api/cancel", (req, res) => {
  const data = readData();
  const ticket = Number(req.body.ticket);
  if (!data.canceled.includes(ticket)) {
    data.canceled.push(ticket);
    // if canceled was already checkedIn, remove from checkedIn
    removeFrom(data.checkedIn, ticket);
    // also if canceled was in issued, keep it but treat as canceled
    logOp(data, `canceled ${ticket}`);
    // after cancel, refill calledIndex in case more can be called
    refillCalledIndex(data);
    writeData(data);
  }
  res.json({ ok:true });
});

// --- API: スキップ（管理者が手動でスキップ） ---
// { ticket } mark as skipped by advancing calledIndex if that ticket was at front
app.post("/api/skip", (req, res) => {
  const data = readData();
  const ticket = Number(req.body.ticket);
  // If this ticket is at position calledIndex (i.e., next to be called), advance calledIndex
  const idx = data.issued.indexOf(ticket);
  if (idx === -1) return res.status(400).json({ ok:false, msg:"not issued" });
  if (idx < data.calledIndex) {
    // already behind
    return res.json({ ok:false, msg:"already behind" });
  }
  if (idx === data.calledIndex) {
    // skip this person -> mark canceled? or just advance calledIndex
    data.calledIndex += 1;
    logOp(data, `skipped ${ticket}`);
    refillCalledIndex(data);
    writeData(data);
    return res.json({ ok:true, calledIndex: data.calledIndex });
  }
  res.json({ ok:false, msg:"not current" });
});

// --- API: 設定 (maxInside, notifyAhead) ---
app.post("/api/admin/settings", (req, res) => {
  const data = readData();
  const { maxInside, notifyAhead } = req.body;
  if (maxInside != null) data.maxInside = Number(maxInside);
  if (notifyAhead != null) data.notifyAhead = Number(notifyAhead);
  // refill after change
  refillCalledIndex(data);
  writeData(data);
  logOp(data, `settings updated maxInside=${data.maxInside}, notifyAhead=${data.notifyAhead}`);
  res.json({ ok:true, maxInside: data.maxInside, notifyAhead: data.notifyAhead });
});

// --- API: 管理者パスワードセット/変更 ---
// { oldPassword?, newPassword }
app.post("/api/admin/setPassword", (req, res) => {
  const data = readData();
  const { oldPassword, newPassword } = req.body;
  if (!newPassword) return res.status(400).json({ ok:false, msg:"newPassword required" });
  if (!data.adminPassword) {
    data.adminPassword = newPassword;
    writeData(data);
    return res.json({ ok:true, msg:"password set" });
  }
  if (oldPassword !== data.adminPassword) return res.status(403).json({ ok:false, msg:"oldPassword mismatch" });
  data.adminPassword = newPassword;
  writeData(data);
  res.json({ ok:true, msg:"password changed" });
});

// --- API: Reset / aggregate / logs ---
app.post("/api/admin/reset", (req, res) => {
  const init = {
    issued: [],
    calledIndex: 0,
    checkedIn: [],
    checkedOut: [],
    canceled: [],
    maxInside: 10,
    notifyAhead: 5,
    adminPassword: readData().adminPassword || null,
    logs: []
  };
  writeData(init);
  res.json({ ok:true });
});
app.get("/api/admin/aggregate", (req,res) => {
  const d = readData();
  res.json({
    totalIssued: d.issued.length,
    inside: insideCount(d),
    checkedIn: d.checkedIn.length,
    checkedOut: d.checkedOut.length,
    canceled: d.canceled.length,
    calledIndex: d.calledIndex,
    logs: d.logs.slice(-100)
  });
});

// --- PDF生成（12分割、両面、表→裏→表→裏順） ---
// POST /api/admin/pdf  { start, end, url }
// - start,end inclusive (numbers). url is used for user-facing QR (表).
app.post("/api/admin/pdf", async (req, res) => {
  try {
    const { start, end, url } = req.body;
    if (start == null || end == null || start > end) return res.status(400).json({ error:"start/end invalid" });

    // prepare ticket array
    const tickets = [];
    for (let i = Number(start); i <= Number(end); i++) tickets.push(i);

    const perPage = 12; // 3 x 4
    const totalPages = Math.ceil(tickets.length / perPage);

    // ordered pages: for i=0; i<totalPages; i += 2 => push front page i, then push back page i+1 (if exists)
    const orderedPages = [];
    for (let i=0;i<totalPages;i+=2){
      // front page slice
      orderedPages.push(tickets.slice(i*perPage, (i+1)*perPage));
      // corresponding back page (next chunk)
      if (i+1 < totalPages) orderedPages.push(tickets.slice((i+1)*perPage, (i+2)*perPage));
    }

    // generate PDF
    const doc = new PDFDocument({ size: "A4", margin: 20 });
    const stream = fs.createWriteStream(PDF_OUTPUT);
    doc.pipe(stream);

    // register font if exists
    if (fs.existsSync(FONT_PATH)) doc.registerFont("NotoJP", FONT_PATH);

    const cols = 3;
    const rows = 4;
    const boxW =  (doc.page.width - 40 - (cols-1)*10) / cols; // margin 20 left/right
    const boxH =  (doc.page.height - 80 - (rows-1)*10) / rows; // some top space for title

    for (let p=0;p<orderedPages.length;p++){
      if (p>0) doc.addPage();
      const pageTickets = orderedPages[p];

      // page header
      doc.font(FONT_PATH && fs.existsSync(FONT_PATH) ? "NotoJP" : "Helvetica").fontSize(14).text(`整理券ページ ${p+1}`, { align:"left" });

      for (let i=0;i<pageTickets.length;i++){
        const num = pageTickets[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 20 + col * (boxW + 10);
        const y = 60 + row * (boxH + 10);

        // frame
        doc.rect(x, y, boxW, boxH).stroke();

        // big number
        doc.fontSize(24);
        const numText = String(num);
        doc.text(numText, x + 10, y + 10);

        // if this is a "front" page (p % 2 === 0) then show URL QR; else it's a "back" page -> show checkin qr
        const isFront = (p % 2 === 0);
        if (isFront) {
          // user QR: url?ticket=num
          const qrDataUrl = await QRCode.toDataURL(`${url}?ticket=${num}`);
          const base64 = qrDataUrl.split(",")[1];
          const buf = Buffer.from(base64, "base64");
          const qrSize = Math.min(boxW, boxH) * 0.45;
          doc.image(buf, x + boxW - qrSize - 10, y + 10, { width: qrSize, height: qrSize });
          // small URL text
          doc.fontSize(10).text(url, x + 10, y + boxH - 20, { width: boxW - 20 });
        } else {
          // back: check-in QR (number only)
          const qrDataUrl = await QRCode.toDataURL(String(num));
          const base64 = qrDataUrl.split(",")[1];
          const buf = Buffer.from(base64, "base64");
          const qrSize = Math.min(boxW, boxH) * 0.45;
          doc.image(buf, x + boxW - qrSize - 10, y + 10, { width: qrSize, height: qrSize });
          doc.fontSize(12).text("チェックイン用", x + 10, y + 10);
        }
      }
    }

    doc.end();

    stream.on("finish", () => {
      // respond with download
      res.download(PDF_OUTPUT, `tickets_${start}-${end}.pdf`, (err) => {
        if (err) console.error("download error:", err);
      });
    });
  } catch (err) {
    console.error("PDF error:", err);
    res.status(500).json({ error: "PDF生成失敗" });
  }
});

// --- 最後にサーバー起動 ---
app.listen(PORT, () => {
  console.log(`✅ Ticket server running at http://localhost:${PORT}`);
});
