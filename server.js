// ✅ PDF生成（壊れない方式・両面対応）
app.post("/admin/pdf", async (req, res) => {
  try {
    const { start, end, url } = req.body;
    const filePath = path.join(__dirname, "tickets.pdf");

    // PDFDocument 作成
    const doc = new PDFDocument({ size: "A4" });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // 1ページに12枚（表面）、次ページが裏面
    const perPage = 12;
    const margin = 40;
    const cols = 3;
    const rows = 4;
    const cellWidth = (doc.page.width - margin * 2) / cols;
    const cellHeight = (doc.page.height - margin * 2) / rows;

    const fontPath = path.join(__dirname, "NotoSansJP-ExtraBold.ttf");
    if (fs.existsSync(fontPath)) {
      doc.registerFont("Noto", fontPath);
    }

    for (let i = start; i <= end; i++) {
      const idx = (i - start) % perPage;
      const pageIndex = Math.floor((i - start) / perPage);

      // 新しいページ
      if (idx === 0 && i !== start) {
        doc.addPage();
      }

      // 表面（番号 + 利用者用QR）
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const x = margin + col * cellWidth;
      const y = margin + row * cellHeight;

      doc.rect(x, y, cellWidth, cellHeight).stroke();
      doc.font("Noto").fontSize(16).text(`整理券番号 ${i}`, x + 10, y + 10);

      const qrData = await QRCode.toDataURL(`${url}?num=${i}`);
      const qrImg = qrData.replace(/^data:image\/png;base64,/, "");
      const qrBuffer = Buffer.from(qrImg, "base64");
      doc.image(qrBuffer, x + 10, y + 40, { width: cellWidth - 20 });

      // 12枚ごとに裏面ページを追加
      if (idx === perPage - 1 || i === end) {
        doc.addPage();
        for (let j = 0; j < perPage; j++) {
          const backIndex = pageIndex * perPage + j + start;
          if (backIndex > end) break;

          const col2 = j % cols;
          const row2 = Math.floor(j / cols);
          const x2 = margin + col2 * cellWidth;
          const y2 = margin + row2 * cellHeight;

          doc.rect(x2, y2, cellWidth, cellHeight).stroke();
          doc.font("Noto").fontSize(16).text("チェックイン用", x2 + 10, y2 + 10);

          const qrBackData = await QRCode.toDataURL(String(backIndex));
          const qrBackImg = qrBackData.replace(/^data:image\/png;base64,/, "");
          const qrBackBuffer = Buffer.from(qrBackImg, "base64");
          doc.image(qrBackBuffer, x2 + 10, y2 + 40, { width: cellWidth - 20 });
        }
        if (i !== end) doc.addPage(); // 次の表面へ
      }
    }

    doc.end();

    // ストリーム完了後にレスポンスを返す
    stream.on("finish", () => {
      res.download(filePath, "tickets.pdf");
    });
  } catch (err) {
    console.error("PDF生成エラー:", err);
    res.status(500).send("PDF生成に失敗しました");
  }
});
