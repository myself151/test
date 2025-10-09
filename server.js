// server.js
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

// data.json に保存：配布済み範囲、チェックイン/チェックアウト
const DATA_FILE = path.join(__dirname, 'data.json');
function initData() {
  if (!fs.existsSync(DATA_FILE)) {
    const init = {
      distributedRange: null, // {start:1,end:50} or null
      checkedIn: [],          // [1,2,3]
      checkedOut: [],         // [2,3]
      maxInside: 5            // 管理者で設定可能
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(init, null, 2));
  }
}
initData();
function readData() { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

// ---------- helper: range utilities ----------
function parseRangeString(rangeStr) {
  // 例: "1-50" -> {start:1,end:50}、不正なら null
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  const m = rangeStr.trim().match(/^(\d+)\s*[-~]\s*(\d+)$/);
  if (!m) return null;
  const s = parseInt(m[1], 10), e = parseInt(m[2], 10);
  if (isNaN(s) || isNaN(e) || s <= 0 || e < s) return null;
  return { start: s, end: e };
}
function rangeCount(range) { return range ? (range.end - range.start + 1) : 0; }
function rangeIncludes(range, num) {
  if (!range) return false;
  return num >= range.start && num <= range.end;
}
// ---------- call number logic ----------
function computeCurrentCall(data) {
  // ルール（以前の合意）:
  // 呼び出し番号 = checkouts_count + min(maxInside, distributedCount - checkouts_count - checkedIn_count)
  const distCount = rangeCount(data.distributedRange);
  const exited = data.checkedOut.length;
  const inside = data.checkedIn.length;
  const remaining = Math.max(0, distCount - exited - inside);
  const canCall = Math.min(Math.max(0, data.maxInside || 0), remaining);
  // currentCall is the numeric ticket value: if exited == 0 and canCall==0 => null
  if (exited === 0 && canCall === 0) return null;
  const index = exited + canCall; // 1-based count offset from start
  if (!data.distributedRange) return null;
  const candidate = data.distributedRange.start + index - 1;
  if (candidate > data.distributedRange.end) return null;
  return candidate;
}

// ---------- Routes: admin UI files (static served from public) ----------
app.get('/admin/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/admin.html'));
});
app.get('/admin/enter', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/enter.html'));
});
app.get('/admin/exit', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/admin/exit.html'));
});
app.get('/user', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/user/user.html'));
});

// ---------- API: 配布済み番号管理 ----------
app.post('/api/setRange', (req, res) => {
  const { range } = req.body; // e.g. "1-50"
  const parsed = parseRangeString(range);
  if (!parsed) return res.status(400).json({ error: 'range format invalid. use "1-50"' });
  const data = readData();
  data.distributedRange = parsed;
  // reset checkin/checkout for safety? keep as-is but remove any outside numbers
  data.checkedIn = data.checkedIn.filter(n => rangeIncludes(parsed, n));
  data.checkedOut = data.checkedOut.filter(n => rangeIncludes(parsed, n));
  writeData(data);
  res.json({ success: true, distributedRange: parsed });
});

app.get('/api/getRange', (req, res) => {
  const data = readData();
  res.json({ distributedRange: data.distributedRange });
});

// ---------- API: 管理設定 ----------
app.post('/api/setMaxInside', (req, res) => {
  const { maxInside } = req.body;
  const data = readData();
  data.maxInside = parseInt(maxInside) || 0;
  writeData(data);
  res.json({ success: true, maxInside: data.maxInside });
});

// ---------- API: checkin / checkout endpoints (called by admin camera pages) ----------
app.post('/api/checkin', (req, res) => {
  const { number } = req.body; // number is integer
  const data = readData();
  if (!data.distributedRange || !rangeIncludes(data.distributedRange, number)) {
    return res.status(400).json({ success: false, message: 'Number not in distributed range' });
  }
  if (!data.checkedIn.includes(number)) data.checkedIn.push(number);
  writeData(data);
  res.json({ success: true });
});

app.post('/api/checkout', (req, res) => {
  const { number } = req.body;
  const data = readData();
  if (!data.distributedRange || !rangeIncludes(data.distributedRange, number)) {
    return res.status(400).json({ success: false, message: 'Number not in distributed range' });
  }
  if (!data.checkedOut.includes(number)) data.checkedOut.push(number);
  writeData(data);
  res.json({ success: true });
});

// ---------- API: 集計 / リセット ----------
app.get('/api/summary', (req, res) => {
  const data = readData();
  res.json({
    distributedRange: data.distributedRange,
    distributedCount: rangeCount(data.distributedRange),
    checkedInCount: data.checkedIn.length,
    checkedOutCount: data.checkedOut.length,
    maxInside: data.maxInside,
    currentCallNumber: computeCurrentCall(data)
  });
});

app.post('/api/reset', (req, res) => {
  const data = readData();
  data.distributedRange = null;
  data.checkedIn = [];
  data.checkedOut = [];
  data.maxInside = 0;
  writeData(data);
  res.json({ success: true });
});

// ---------- API: current call retrieval for users ----------
app.get('/api/current', (req, res) => {
  const data = readData();
  const current = computeCurrentCall(data);
  // Also prepare notify list: numbers that should be notified (e.g. next 5? you requested 5 before)
  const notifyAhead = 5;
  let notifyList = [];
  if (data.distributedRange) {
    // find index of current in sequence (start...end)
    const start = data.distributedRange.start;
    const end = data.distributedRange.end;
    const currentNum = computeCurrentCall(data);
    if (currentNum) {
      const curIndex = currentNum - start; // 0-based
      for (let i = 1; i <= notifyAhead; i++) {
        const n = currentNum + i;
        if (n <= end) notifyList.push(n);
      }
    } else {
      // if no current, notify first min(notifyAhead, total)
      for (let i = 0; i < Math.min(notifyAhead, rangeCount(data.distributedRange)); i++) {
        notifyList.push(data.distributedRange.start + i);
      }
    }
  }
  res.json({ current, notify: notifyList });
});

// ---------- PDF generation endpoint (stable) ----------
app.post('/api/generate-pdf', async (req, res) => {
  // body: { start: int, end: int, siteURL: "https://..." }
  try {
    const { start, end, siteURL } = req.body;
    if (!start || !end || end < start) return res.status(400).json({ error: 'start/end invalid' });

    const filePath = path.join(__dirname, 'tickets.pdf');
    const doc = new PDFDocument({ size: 'A4', margin: 10 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // font
    const fontPath = path.join(__dirname, 'NotoSansJP-ExtraBold.ttf');
    if (fs.existsSync(fontPath)) doc.registerFont('NotoJP', fontPath);

    // layout: 3 cols x 4 rows = 12 per page
    const cols = 3, rows = 4;
    const perPage = cols * rows;
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 10;
    const usableW = pageWidth - margin * 2;
    const usableH = pageHeight - margin * 2;
    const cellW = usableW / cols;
    const cellH = usableH / rows;

    // generate table of all numbers
    const nums = [];
    for (let n = start; n <= end; n++) nums.push(n);

    // First: draw all fronts (表)
    for (let i = 0; i < nums.length; i++) {
      const indexOnPage = i % perPage;
      if (indexOnPage === 0 && i !== 0) doc.addPage();
      const col = indexOnPage % cols;
      const row = Math.floor(indexOnPage / cols);
      const x = margin + col * cellW;
      const y = margin + row * cellH;

      doc.save();
      doc.rect(x + 4, y + 4, cellW - 8, cellH - 8).stroke();
      doc.font('NotoJP' in doc._fontFamilies ? 'NotoJP' : 'Helvetica').fontSize(20);
      doc.text(String(nums[i]), x + 8, y + 12, { width: cellW - 16, align: 'center' });

      // QR (siteURL?ticket=)
      const qrDataUrl = await QRCode.toDataURL(`${siteURL}?ticket=${nums[i]}`);
      const b64 = qrDataUrl.split(',')[1];
      const buffer = Buffer.from(b64, 'base64');
      // center QR in the lower area of the cell
      const qrSize = Math.min(cellW - 30, cellH / 2);
      const qx = x + (cellW - qrSize) / 2;
      const qy = y + cellH - qrSize - 12;
      doc.image(buffer, qx, qy, { width: qrSize, height: qrSize });
      doc.restore();
    }

    // After finish fronts, add a page for backs of same count
    doc.addPage();

    // Now backs (裏面) in same order: QR only (number-only), with "チェックイン用" text
    for (let i = 0; i < nums.length; i++) {
      const indexOnPage = i % perPage;
      if (indexOnPage === 0 && i !== 0) doc.addPage();
      const col = indexOnPage % cols;
      const row = Math.floor(indexOnPage / cols);
      const x = margin + col * cellW;
      const y = margin + row * cellH;

      doc.save();
      doc.rect(x + 4, y + 4, cellW - 8, cellH - 8).stroke();
      doc.font('NotoJP' in doc._fontFamilies ? 'NotoJP' : 'Helvetica').fontSize(14);
      doc.text('チェックイン用', x + 8, y + 12, { width: cellW - 16, align: 'center' });

      const qrDataUrl = await QRCode.toDataURL(String(nums[i]));
      const b64 = qrDataUrl.split(',')[1];
      const buffer = Buffer.from(b64, 'base64');
      const qrSize = Math.min(cellW - 30, cellH / 2);
      const qx = x + (cellW - qrSize) / 2;
      const qy = y + (cellH - qrSize) / 2;
      doc.image(buffer, qx, qy, { width: qrSize, height: qrSize });
      doc.restore();
    }

    doc.end();

    stream.on('finish', () => {
      // Return PDF for download
      res.download(filePath, 'tickets.pdf', (err) => {
        if (err) console.error('download error', err);
      });
    });
  } catch (err) {
    console.error('PDF generation error', err);
    res.status(500).json({ error: 'pdf generation failed' });
  }
});

// ---------- start ----------
app.listen(PORT, () => {
  console.log(`Ticket system server running on http://localhost:${PORT}`);
});
