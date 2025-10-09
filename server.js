const express = require('express');
const bodyParser = require('body-parser');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { createWriteStream } = require('fs');
const { PDFDocument: PDFDoc } = require('pdf-lib');
const { createCanvas } = require('canvas');
const { PDFDocument: RL_PDF } = require('pdf-lib');
const { PDFDocument: RLPDF } = require('pdf-lib');
const { PDFDocument: RL } = require('pdf-lib');
const { PDFDocument: PDFL } = require('pdf-lib');

const { PDFDocument: PDFReport } = require('pdf-lib');

const { PDFDocument: PdfDoc } = require('pdf-lib');

const { PDFDocument: PDoc } = require('pdf-lib');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

let currentNumber = 1;
let issuedRange = "なし";

// 整理券発行API
app.post('/issue', (req, res) => {
  const number = currentNumber++;
  res.json({ number });
});

// 配布済み番号の管理API
app.get('/range', (req, res) => {
  res.json({ range: issuedRange });
});

app.post('/range', (req, res) => {
  issuedRange = req.body.range;
  res.json({ success: true });
});

// PDF生成API（壊れない方式）
app.get('/ticket-pdf/:number', async (req, res) => {
  const number = req.params.number;
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A6' });

  res.setHeader('Content-disposition', `attachment; filename=ticket-${number}.pdf`);
  res.setHeader('Content-type', 'application/pdf');

  doc.fontSize(20).text(`整理券番号: ${number}`, { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).text(`発行日時: ${new Date().toLocaleString()}`, { align: 'center' });
  doc.end();
  doc.pipe(res);
});

const PORT = 9000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
