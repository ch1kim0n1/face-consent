import QRCode from "qrcode";

export async function buildPortraitQrDataUrl(token: string, avatarUrl: string) {
  const qrDataUrl = await QRCode.toDataURL(token, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 512,
    color: { dark: "#000000", light: "#ffffff" },
  });

  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d")!;

  const qrImg = await loadImage(qrDataUrl);
  ctx.drawImage(qrImg, 0, 0, 512, 512);

  const avatar = await loadImage(avatarUrl);
  const size = 160;
  const x = (512 - size) / 2;
  const y = (512 - size) / 2;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(256, 256, size / 2 + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(256, 256, size / 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(avatar, x, y, size, size);
  ctx.restore();

  return canvas.toDataURL("image/png");
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
