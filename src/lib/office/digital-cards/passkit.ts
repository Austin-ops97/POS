import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import forge from "node-forge";
import JSZip from "jszip";
import { cardPalette, type CardTheme } from "./theme";

/**
 * Apple Wallet for a published digital card.
 *
 * Required environment (see .env.example):
 * - PASSKIT_PASS_TYPE_IDENTIFIER  Pass Type ID, for example pass.com.example.emeraldone.card
 * - PASSKIT_TEAM_IDENTIFIER       10-character Apple Team ID
 * - PASSKIT_CERT_P12_BASE64       Pass Type ID certificate and private key, exported as .p12, base64
 * - PASSKIT_CERT_PASSPHRASE       Passphrase for that .p12 (set to empty only when the file has none)
 * - PASSKIT_WWDR_PEM              Apple WWDR intermediate certificate (PEM, or PEM with \n escapes, or base64 PEM)
 *
 * The pass barcode is the public card URL. It does not add a contact.
 */

export const PASSKIT_REQUIRED_ENV = [
  "PASSKIT_PASS_TYPE_IDENTIFIER",
  "PASSKIT_TEAM_IDENTIFIER",
  "PASSKIT_CERT_P12_BASE64",
  "PASSKIT_WWDR_PEM",
] as const;

export type PasskitStatus =
  | { ready: true; missing: [] }
  | { ready: false; missing: string[] };

export class PasskitConfigError extends Error {
  missing: string[];
  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = "PasskitConfigError";
    this.missing = missing;
  }
}

export type PasskitEnv = Record<string, string | undefined>;

export function inspectPasskit(env: PasskitEnv = process.env): PasskitStatus {
  const missing: string[] = [];
  for (const key of PASSKIT_REQUIRED_ENV) {
    if (!env[key]?.trim()) missing.push(key);
  }
  if (env.PASSKIT_CERT_PASSPHRASE == null) missing.push("PASSKIT_CERT_PASSPHRASE");
  if (missing.length) return { ready: false, missing };
  const passTypeId = env.PASSKIT_PASS_TYPE_IDENTIFIER!.trim();
  const teamId = env.PASSKIT_TEAM_IDENTIFIER!.trim();
  if (!/^pass\.[A-Za-z0-9.-]+$/.test(passTypeId)) missing.push("PASSKIT_PASS_TYPE_IDENTIFIER");
  if (!/^[A-Z0-9]{10}$/.test(teamId)) missing.push("PASSKIT_TEAM_IDENTIFIER");
  if (missing.length) return { ready: false, missing };
  return { ready: true, missing: [] };
}

export type WalletPassInput = {
  serialNumber: string;
  publicUrl: string;
  businessName: string;
  personName: string;
  jobTitle?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  theme: CardTheme;
};

function hexToRgb(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

export function buildPassJson(input: WalletPassInput, env: PasskitEnv) {
  const palette = cardPalette(input.theme);
  const foreground = hexToRgb(palette.ink);
  const background = hexToRgb(palette.gradientFrom);
  const label = hexToRgb(palette.accent);
  const barcode = {
    message: input.publicUrl,
    format: "PKBarcodeFormatQR",
    messageEncoding: "iso-8859-1",
    altText: "Open digital card",
  };
  const secondary = input.jobTitle?.trim() || input.businessName;
  const backFields = [
    { key: "card", label: "CARD", value: input.publicUrl },
    ...(input.email ? [{ key: "email", label: "EMAIL", value: input.email }] : []),
    ...(input.website ? [{ key: "web", label: "WEB", value: input.website }] : []),
  ];
  return {
    formatVersion: 1,
    passTypeIdentifier: env.PASSKIT_PASS_TYPE_IDENTIFIER!.trim(),
    serialNumber: input.serialNumber,
    teamIdentifier: env.PASSKIT_TEAM_IDENTIFIER!.trim(),
    organizationName: input.businessName.slice(0, 64) || "EmeraldOne",
    description: `${input.personName} · ${input.businessName}`.slice(0, 120),
    logoText: (input.businessName || input.personName).slice(0, 16),
    foregroundColor: foreground,
    backgroundColor: background,
    labelColor: label,
    barcode,
    barcodes: [barcode],
    generic: {
      primaryFields: [{ key: "name", label: "NAME", value: input.personName }],
      secondaryFields: [{ key: "title", label: input.jobTitle?.trim() ? "TITLE" : "BUSINESS", value: secondary }],
      auxiliaryFields: input.phone?.trim()
        ? [{ key: "phone", label: "PHONE", value: input.phone.trim() }]
        : [],
      backFields,
    },
  };
}

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

/** Solid branded PNG. Wallet requires PNG icons; this avoids a binary asset dependency. */
export function brandedPng(width: number, height: number, theme: CardTheme) {
  const palette = cardPalette(theme);
  const from = Number.parseInt(palette.gradientFrom.slice(1), 16);
  const accent = Number.parseInt(palette.accent.slice(1), 16);
  const fr = (from >> 16) & 255;
  const fg = (from >> 8) & 255;
  const fb = from & 255;
  const ar = (accent >> 16) & 255;
  const ag = (accent >> 8) & 255;
  const ab = accent & 255;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const cx = width * 0.72;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.28;
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const inMark = (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
      const offset = row + 1 + x * 3;
      raw[offset] = inMark ? ar : fr;
      raw[offset + 1] = inMark ? ag : fg;
      raw[offset + 2] = inMark ? ab : fb;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function decodePem(value: string) {
  const unescaped = value.trim().replace(/\\n/g, "\n");
  if (unescaped.includes("BEGIN CERTIFICATE")) return unescaped;
  const decoded = Buffer.from(value.trim(), "base64").toString("utf8");
  if (decoded.includes("BEGIN CERTIFICATE")) return decoded;
  throw new PasskitConfigError(
    "Apple Wallet is not configured. The WWDR certificate could not be read."
  );
}

function signerFromP12(p12Base64: string, passphrase: string) {
  try {
    const der = Buffer.from(p12Base64.replace(/\s+/g, ""), "base64");
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString("binary")));
    const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, passphrase);
    const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
    const shrouded = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[
      forge.pki.oids.pkcs8ShroudedKeyBag
    ]?.[0];
    const plain = p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
    const certificate = certBag?.cert;
    const key = shrouded?.key || plain?.key;
    if (!certificate || !key) {
      throw new Error("missing bag");
    }
    return { certificate, key };
  } catch {
    throw new PasskitConfigError(
      "Apple Wallet is not configured. The Pass Type ID certificate or passphrase could not be read."
    );
  }
}

function signManifest(manifest: Buffer, env: PasskitEnv) {
  const { certificate, key } = signerFromP12(
    env.PASSKIT_CERT_P12_BASE64!.trim(),
    env.PASSKIT_CERT_PASSPHRASE ?? ""
  );
  let wwdr: forge.pki.Certificate;
  try {
    wwdr = forge.pki.certificateFromPem(decodePem(env.PASSKIT_WWDR_PEM!.trim()));
  } catch (error) {
    if (error instanceof PasskitConfigError) throw error;
    throw new PasskitConfigError(
      "Apple Wallet is not configured. The WWDR certificate could not be read."
    );
  }
  const signed = forge.pkcs7.createSignedData();
  signed.content = forge.util.createBuffer(manifest.toString("binary"));
  signed.addCertificate(certificate);
  signed.addCertificate(wwdr);
  signed.addSigner({
    key: key as forge.pki.rsa.PrivateKey,
    certificate,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  signed.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(signed.toAsn1()).getBytes(), "binary");
}

export async function createBusinessCardPass(
  input: WalletPassInput,
  env: PasskitEnv = process.env
) {
  const status = inspectPasskit(env);
  if (!status.ready) {
    throw new PasskitConfigError(
      "Apple Wallet is not configured. Add the Pass Type ID certificate before downloading a pass.",
      status.missing
    );
  }
  if (!input.publicUrl.startsWith("https://") && !input.publicUrl.startsWith("http://")) {
    throw new PasskitConfigError("Set NEXT_PUBLIC_APP_URL so the Wallet pass can open this card.");
  }
  if (/begin:vcard/i.test(input.publicUrl)) {
    throw new PasskitConfigError("Wallet passes must open the card page.");
  }

  const files = new Map<string, Buffer>();
  files.set("pass.json", Buffer.from(JSON.stringify(buildPassJson(input, env))));
  files.set("icon.png", brandedPng(29, 29, input.theme));
  files.set("icon@2x.png", brandedPng(58, 58, input.theme));
  files.set("logo.png", brandedPng(160, 50, input.theme));
  files.set("logo@2x.png", brandedPng(320, 100, input.theme));

  const manifest: Record<string, string> = {};
  for (const [name, body] of files) {
    manifest[name] = createHash("sha1").update(body).digest("hex");
  }
  const manifestBuffer = Buffer.from(JSON.stringify(manifest));
  const signature = signManifest(manifestBuffer, env);

  const zip = new JSZip();
  for (const [name, body] of files) zip.file(name, body);
  zip.file("manifest.json", manifestBuffer);
  zip.file("signature", signature);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
