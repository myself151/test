// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const PDFDocument = require('pdfkit');
const qrcode = require('qrcode');

const app = express();
const DATA_FILE = path.join(__dirname, 'data.json');
const FONT_FILE = path.join(__dirname, 'NotoSansJP-ExtraBold.ttf');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// データ読み込み
function loadData() {
    if (!fs.existsSync(DATA_FILE)) return { tickets: [], checkin: [], checkout: [], callIndex: 0 };
    return JSON.parse(fs.readFileSync(DATA_FILE));
}
function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 管理者ページ
app.get('/admin/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/admin.html'));
});
app.get('/admin/enter', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/enter.html'));
});
app.get('/admin/exit', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/admin/exit.html'));
});

// 利用者ページ
app.get('/user', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/user/user.html'));
});

// 整理券発行
app.post('/admin/issue', async (req, res) => {
    const { start, end, url } = req.body;
    const data = loadData();
    for (let i = start; i <= end; i++) {
        const ticket = { number: i, url: url };
        data.tickets.push(ticket);
    }
    saveData(data);
    res.json({ success: true });
});

// PDF生成（両面）
app.post('/admin/pdf', async (req, res) => {
    const { start, end, url } = req.body;
    const doc = new PDFDocument({ size: 'A4' });
    const filePath = path.join(__dirname, 'tickets.pdf');
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const perPage = 12;
    let numCount = 0;
    for (let i = start; i <= end; i++) {
        if (numCount > 0 && numCount % perPage === 0) doc.addPage();
        doc.font(FONT_FILE).fontSize(20).text(`整理券番号: ${i}`, 50, 50);
        const qrData = `${url}?ticket=${i}`;
        const qrImage = await qrcode.toDataURL(qrData);
        doc.image(qrImage, 50, 100, { width: 100, height: 100 });

        // 裏面
        doc.addPage();
        doc.font(FONT_FILE).fontSize(20).text('チェックイン用', 50, 50);
        const qrBack = await qrcode.toDataURL(`${i}`);
        doc.image(qrBack, 50, 100, { width: 100, height: 100 });

        numCount++;
    }

    doc.end();
    stream.on('finish', () => res.download(filePath));
});

// チェックイン/チェックアウト
app.post('/admin/checkin', (req, res) => {
    const { number } = req.body;
    const data = loadData();
    if (!data.checkin.includes(number)) data.checkin.push(number);
    saveData(data);
    res.json({ success: true });
});
app.post('/admin/checkout', (req, res) => {
    const { number } = req.body;
    const data = loadData();
    if (!data.checkout.includes(number)) data.checkout.push(number);
    saveData(data);
    res.json({ success: true });
});

// 呼び出し番号取得
app.get('/admin/current', (req, res) => {
    const data = loadData();
    const callIndex = data.callIndex || 0;
    const currentTicket = data.tickets[callIndex] || null;
    res.json({ current: currentTicket });
});

// 集計
app.get('/admin/summary', (req, res) => {
    const data = loadData();
    res.json({ checkinCount: data.checkin.length, checkoutCount: data.checkout.length });
});

// リセット
app.post('/admin/reset', (req, res) => {
    const data = { tickets: [], checkin: [], checkout: [], callIndex: 0 };
    saveData(data);
    res.json({ success: true });
});

app.listen(3000, () => console.log('Server running on http://localhost:3000'));
