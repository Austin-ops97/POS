import QRCode from "qrcode";
import { qrPayloadForCard } from "./access";

export async function renderCardQrPng(origin: string, slug: string) {
  const payload = qrPayloadForCard(origin, slug);
  const png = await QRCode.toBuffer(payload, {
    type: "png",
    width: 640,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#042f2e", light: "#ffffff" },
  });
  return { payload, png };
}
