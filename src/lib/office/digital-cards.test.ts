import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { createPathMatcher } from "@clerk/shared/pathMatcher";
import forge from "node-forge";
import JSZip from "jszip";
import { PUBLIC_ROUTE_PATTERNS } from "@/lib/public-routes";
import { digitalCardWriteSchema } from "@/lib/validations/digital-cards";
import {
  DEFAULT_CARD_THEME,
  canEditDigitalCard,
  cardContentPatch,
  cardPalette,
  changedCardFields,
  digitalCardAuditDetails,
  digitalCardListWhere,
  digitalCardLookupWhere,
  isPubliclyReadable,
  publishedCardScope,
  qrPayloadForCard,
  resolveCardSlug,
} from "./digital-cards/access";
import { renderCardQrPng } from "./digital-cards/qr";
import { buildDigitalCardVCard } from "./digital-cards/vcard";
import { cardShareMetadata, metadataFromShare } from "./digital-cards/share";
import { createBusinessCardPass, inspectPasskit, PasskitConfigError } from "./digital-cards/passkit";

const sampleWrite = {
  businessName: "Emerald Vale",
  personName: "Ada Lovelace",
  jobTitle: "Proprietor",
  email: "ada@emerald.example",
  website: "https://emerald.example",
  note: "Ask for the garden desk.",
  theme: DEFAULT_CARD_THEME,
  phones: [{ label: "Mobile", number: "+1 555 010 1000", visible: true }],
  addresses: [
    {
      label: "Studio",
      line1: "10 Glass Street",
      line2: "Suite 2",
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US",
      visible: true,
    },
  ],
  socialLinks: [
    { network: "INSTAGRAM" as const, label: "", url: "https://instagram.com/emeraldvale", visible: true },
  ],
};

describe("digital card tenant isolation", () => {
  it("always pins businessId and hides other tenants", () => {
    const list = digitalCardListWhere({ businessId: "biz-a", employeeId: "emp-me", viewAll: true });
    assert.equal(list.businessId, "biz-a");
    assert.equal("createdById" in list, false);

    const own = digitalCardListWhere({ businessId: "biz-a", employeeId: "emp-me", viewAll: false });
    assert.equal(own.businessId, "biz-a");
    assert.equal(own.createdById, "emp-me");

    const lookup = digitalCardLookupWhere({
      businessId: "biz-a",
      employeeId: "emp-me",
      viewAll: true,
      id: "card-1",
    });
    assert.equal(lookup.businessId, "biz-a");
    assert.equal(lookup.id, "card-1");

    assert.equal(
      canEditDigitalCard({
        actorBusinessId: "biz-a",
        actorEmployeeId: "emp-me",
        permissions: { edit: true, create: true },
        card: { businessId: "biz-b", createdById: "emp-me" },
      }),
      false
    );
  });

  it("lets a creator edit their own card and keeps editors inside the tenant", () => {
    assert.equal(
      canEditDigitalCard({
        actorBusinessId: "biz-a",
        actorEmployeeId: "emp-me",
        permissions: { edit: false, create: true },
        card: { businessId: "biz-a", createdById: "emp-me" },
      }),
      true
    );
    assert.equal(
      canEditDigitalCard({
        actorBusinessId: "biz-a",
        actorEmployeeId: "emp-me",
        permissions: { edit: false, create: true },
        card: { businessId: "biz-a", createdById: "emp-other" },
      }),
      false
    );
  });
});

describe("public digital card reads", () => {
  it("opens only /c/:slug and leaves authenticated routes protected", () => {
    const isPublic = createPathMatcher([...PUBLIC_ROUTE_PATTERNS]);
    assert.equal(isPublic("/c/stableSlug12"), true);
    assert.equal(isPublic("/api/public/cards/stableSlug12/vcard"), true);
    assert.equal(isPublic("/customers"), false);
    assert.equal(isPublic("/customers/1"), false);
    assert.equal(isPublic("/cards"), false);
    assert.equal(isPublic("/checkout"), false);
    assert.equal(isPublic("/office/cards"), false);
  });

  it("requires a published slug and no authenticated subject", () => {
    assert.equal(isPubliclyReadable({ status: "PUBLISHED", slug: "abcdefghijkl" }), true);
    assert.equal(isPubliclyReadable({ status: "DRAFT", slug: "abcdefghijkl" }), false);
    assert.equal(isPubliclyReadable({ status: "UNPUBLISHED", slug: "abcdefghijkl" }), false);
    assert.equal(isPubliclyReadable({ status: "PUBLISHED", slug: null }), false);
    const scope = publishedCardScope("abcdefghijkl");
    assert.deepEqual(Object.keys(scope).sort(), ["slug", "status"]);
    assert.equal(scope.status, "PUBLISHED");
  });
});

describe("digital card vCard", () => {
  it("includes the contact fields and social URLs", () => {
    const card = buildDigitalCardVCard({
      personName: sampleWrite.personName,
      businessName: sampleWrite.businessName,
      jobTitle: sampleWrite.jobTitle,
      email: sampleWrite.email,
      website: sampleWrite.website,
      note: sampleWrite.note,
      phones: sampleWrite.phones,
      addresses: sampleWrite.addresses,
      socialLinks: sampleWrite.socialLinks,
    });
    assert.match(card, /BEGIN:VCARD/);
    assert.match(card, /FN:Ada Lovelace/);
    assert.match(card, /ORG:Emerald Vale/);
    assert.match(card, /TITLE:Proprietor/);
    assert.match(card, /TEL;TYPE=CELL:\+1 555 010 1000/);
    assert.match(card, /EMAIL;TYPE=INTERNET:ada@emerald\.example/);
    assert.match(card, /URL:https:\/\/emerald\.example/);
    assert.match(card, /ADR;TYPE=WORK:;Suite 2;10 Glass Street;Austin;TX;78701;US/);
    assert.match(card, /X-ABLabel:Instagram/);
    assert.match(card, /X-SOCIALPROFILE;TYPE=instagram:https:\/\/instagram\.com\/emeraldvale/);
    assert.match(card, /NOTE:Ask for the garden desk\./);
    assert.match(card, /END:VCARD/);
  });
});

describe("digital card slug stability", () => {
  it("keeps the published slug through edits and later publishes", () => {
    const slug = "stableSlug12";
    assert.equal(resolveCardSlug(null, false, () => "should-not-run"), null);
    assert.equal(resolveCardSlug(null, true, () => "firstSlug000"), "firstSlug000");
    assert.equal(resolveCardSlug(slug, false, () => "changed"), slug);
    assert.equal(resolveCardSlug(slug, true, () => "changed"), slug);
    const patch = cardContentPatch(digitalCardWriteSchema.parse(sampleWrite));
    assert.equal("slug" in patch, false);
    assert.equal("status" in patch, false);
    const changed = changedCardFields(digitalCardWriteSchema.parse(sampleWrite), {
      ...digitalCardWriteSchema.parse(sampleWrite),
      email: "new@emerald.example",
    });
    assert.deepEqual(changed, ["email"]);
    const audit = digitalCardAuditDetails("update", { slug, status: "PUBLISHED" }, changed);
    assert.equal(JSON.stringify(audit).includes("new@emerald.example"), false);
    assert.equal(audit.slug, slug);
  });

  it("rejects a client-supplied slug on write", () => {
    const parsed = digitalCardWriteSchema.parse({ ...sampleWrite, slug: "hijacked-slug" });
    assert.equal("slug" in parsed, false);
  });
});

describe("digital card sharing metadata", () => {
  it("includes Open Graph and Twitter tags with the business name and logo", () => {
    const share = cardShareMetadata({
      businessName: "Emerald Vale",
      personName: "Ada Lovelace",
      jobTitle: "Proprietor",
      note: "Ask for the garden desk.",
      pageUrl: "https://emerald.example/c/stableSlug12",
      imageUrl: "https://cdn.example/logo.png",
    });
    const metadata = metadataFromShare(share);
    assert.match(String(metadata.openGraph && "title" in metadata.openGraph ? metadata.openGraph.title : ""), /Emerald Vale/);
    assert.equal(share.openGraph.siteName, "Emerald Vale");
    assert.equal(share.twitter.card, "summary");
    assert.ok(share.tags.some((tag) => tag.property === "og:title" && tag.content.includes("Emerald Vale")));
    assert.ok(share.tags.some((tag) => tag.property === "og:description" && tag.content.includes("garden desk")));
    assert.ok(share.tags.some((tag) => tag.property === "og:image" && tag.content === "https://cdn.example/logo.png"));
    assert.ok(share.tags.some((tag) => tag.name === "twitter:card" && tag.content === "summary"));
    assert.equal(share.openGraph.images?.[0]?.url, "https://cdn.example/logo.png");
  });
});

describe("digital card QR", () => {
  it("encodes the public page URL and not a vCard", async () => {
    const { payload, png } = await renderCardQrPng("https://emerald.example", "stableSlug12");
    assert.equal(payload, qrPayloadForCard("https://emerald.example", "stableSlug12"));
    assert.equal(payload, "https://emerald.example/c/stableSlug12");
    assert.doesNotMatch(payload, /BEGIN:VCARD/i);
    assert.equal(png[0], 0x89);
    assert.equal(png[1], 0x50);
  });
});

describe("digital card contrast", () => {
  it("keeps ink readable on light and dark gradients", () => {
    assert.equal(cardPalette(DEFAULT_CARD_THEME).ink, "#f8fafc");
    assert.equal(
      cardPalette({ accent: "#fbbf24", gradientFrom: "#f8fafc", gradientTo: "#e2e8f0" }).ink,
      "#0f172a"
    );
    const unsafe = cardPalette({
      accent: "red; background:url(https://evil.example)",
      gradientFrom: "#fff",
      gradientTo: "expression(",
    });
    assert.match(unsafe.gradient, /#042f2e/);
    assert.doesNotMatch(unsafe.gradient, /evil|expression|red/);
  });
});

describe("Apple Wallet pass", () => {
  it("reports missing certificates instead of signing", async () => {
    const status = inspectPasskit({});
    assert.equal(status.ready, false);
    if (!status.ready) {
      assert.ok(status.missing.includes("PASSKIT_PASS_TYPE_IDENTIFIER"));
      assert.ok(status.missing.includes("PASSKIT_CERT_P12_BASE64"));
      assert.ok(status.missing.includes("PASSKIT_CERT_PASSPHRASE"));
      assert.ok(status.missing.includes("PASSKIT_WWDR_PEM"));
    }
    await assert.rejects(
      () =>
        createBusinessCardPass(
          {
            serialNumber: "card_1",
            publicUrl: "https://emerald.example/c/stableSlug12",
            businessName: "Emerald Vale",
            personName: "Ada Lovelace",
            theme: DEFAULT_CARD_THEME,
          },
          {}
        ),
      (error: unknown) => error instanceof PasskitConfigError && error.missing.length > 0
    );
  });

  it("builds a pkpass whose QR opens the public card", async () => {
    const passphrase = "wallet-test";
    const signer = certificatePair("Pass Type ID");
    const wwdr = certificatePair("Apple WWDR");
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(signer.key, [signer.cert], passphrase, {
      algorithm: "3des",
    });
    const p12 = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), "binary").toString("base64");
    const env = {
      PASSKIT_PASS_TYPE_IDENTIFIER: "pass.com.example.emeraldone.card",
      PASSKIT_TEAM_IDENTIFIER: "ABCDE12345",
      PASSKIT_CERT_P12_BASE64: p12,
      PASSKIT_CERT_PASSPHRASE: passphrase,
      PASSKIT_WWDR_PEM: forge.pki.certificateToPem(wwdr.cert),
    };
    const url = "https://emerald.example/c/stableSlug12";
    const pass = await createBusinessCardPass(
      {
        serialNumber: "card_1",
        publicUrl: url,
        businessName: "Emerald Vale",
        personName: "Ada Lovelace",
        jobTitle: "Proprietor",
        phone: "+1 555 010 1000",
        email: "ada@emerald.example",
        theme: DEFAULT_CARD_THEME,
      },
      env
    );
    const zip = await JSZip.loadAsync(pass);
    const document = JSON.parse(await zip.file("pass.json")!.async("string"));
    assert.equal(document.barcode.message, url);
    assert.equal(document.barcodes[0].format, "PKBarcodeFormatQR");
    assert.doesNotMatch(JSON.stringify(document), /BEGIN:VCARD/i);
    const manifest = JSON.parse(await zip.file("manifest.json")!.async("string"));
    const passJson = await zip.file("pass.json")!.async("nodebuffer");
    assert.equal(manifest["pass.json"], createHash("sha1").update(passJson).digest("hex"));
    const signature = await zip.file("signature")!.async("nodebuffer");
    assert.ok(signature.length > 32);
  });
});

function certificatePair(commonName: string) {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
  const attrs = [{ name: "commonName", value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { key: keys.privateKey, cert };
}
