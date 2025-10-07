const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = path.join(__dirname, 'data.json');
let data = { tickets: [], checkins: [], checkouts: [], currentIndex: 0, maxInside: 0 };
if (fs.existsSync(DATA_FILE)) data = JSON.parse(fs.readFileSync(DATA_FILE));

function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data));
}

// --- 管理者用 ---
app.get('/admin/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/admin.html')));
app.get('/admin/enter', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/enter.html')));
app.get('/admin/exit', (req, res) => res.sendFile(path.join(__dirname, 'public/admin/exit.html')));

// 集計
app.get('/admin/summary', (req, res) => {
  res.json({ checkinCount: data.checkins.length, checkoutCount: data.checkouts.length });
});

// リセット
app.post('/admin/reset', (req, res) => {
  data.tickets = [];
  data.checkins = [];
  data.checkouts = [];
  data.currentIndex = 0;
  data.maxInside = 0;
  saveData();
  res.sendStatus(200);
});

// チェックイン
app.post('/admin/checkin', (req, res) => {
  const number = req.body.number;
  if (!data.checkins.includes(number)) data.checkins.push(number);
  saveData();
  res.sendStatus(200);
});

// チェックアウト
app.post('/admin/checkout', (req, res) => {
  const number = req.body.number;
  if (!data.checkouts.includes(number)) data.checkouts.push(number);
  saveData();
  res.sendStatus(200);
});

// 現在の呼び出し番号
app.get('/admin/current', (req, res) => {
  const current = data.tickets[data.currentIndex] || null;
  res.json({ current });
});

// --- 利用者用 ---
app.get('/user/user.html', (req, res) => res.sendFile(path.join(__dirname, 'public/user/user.html')));

// --- 整理券発行・PDF生成 ---
app.post('/admin/pdf', async (req, res) => {
  const { start, end, url } = req.body;
  const doc = new PDFDocument({ size: 'A4' });
  const filePath = path.join(__dirname, 'tickets.pdf');
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  const perPage = 12;
  let count = 0;
  for (let num = start; num <= end; num++) {
    const x = (count % 3) * 180 + 20;
    const y = Math.floor(count / 3) * 150 + 20;
    doc.font(path.join(__dirname, 'NotoSansJP-ExtraBold.ttf')).fontSize(16).text(`整理券番号: ${num}`, x, y);
    
    // 表面QR
    const qrData = await QRCode.toDataURL(`${url}?ticket=${num}`);
    const img = qrData.replace(/^data:image\/png;base64,/, "");
    doc.image(Buffer.from(img, 'base64'), x, y + 30, { width: 100, height: 100 });

    // 裏面: チェックイン用QR
    doc.addPage();
    doc.fontSize(16).text('チェックイン用', 50, 50);
    const checkinQR = await QRCode.toDataURL(`${num}`);
    const checkinImg = checkinQR.replace(/^data:image\/png;base64,/, "");
    doc.image(Buffer.from(checkinImg, 'base64'), 50, 80, { width: 100, height: 100 });

    count++;
    if (count % perPage === 0) doc.addPage();
  }

  doc.end();
  stream.on('finish', () => res.json({ path: '/tickets.pdf' }));
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
