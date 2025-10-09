// カメラ常時起動 & QR読み取り
if ("BarcodeDetector" in window) {
  const video = document.querySelector("video");
  if (video) {
    navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      .then(stream => { video.srcObject = stream; video.play(); });

    const detector = new BarcodeDetector({ formats: ["qr_code"] });

    async function scan() {
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          const number = new URL(barcodes[0].rawValue).searchParams.get("number");
          if (location.pathname.includes("enter")) {
            await fetch("/enter", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ number }) });
          } else if (location.pathname.includes("exit")) {
            await fetch("/exit", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ number }) });
          }
        }
      } catch (e) { }
      requestAnimationFrame(scan);
    }
    scan();
  }
}
