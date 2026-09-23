import { z } from "zod";

export const SOCIAL_NETWORKS = [
  "INSTAGRAM",
  "FACEBOOK",
  "LINKEDIN",
  "X",
  "TIKTOK",
  "YOUTUBE",
  "CUSTOM",
] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a six-digit hex color");

export const cardThemeSchema = z.object({
  accent: hexColor,
  gradientFrom: hexColor,
  gradientTo: hexColor,
});

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const optionalEmail = z
  .string()
  .trim()
  .max(180)
  .refine(
    (value) => value.length === 0 || z.string().email().safeParse(value).success,
    "Enter a valid email"
  );

const optionalWebsite = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value.length === 0 || isHttpUrl(value), "Website must start with http:// or https://");

export const digitalCardPhoneSchema = z.object({
  label: z.string().trim().max(40).default(""),
  number: z
    .string()
    .trim()
    .min(7)
    .max(40)
    .refine((value) => (value.match(/\d/g) ?? []).length >= 7, "Enter a phone number"),
  visible: z.boolean().default(true),
});

export const digitalCardAddressSchema = z.object({
  label: z.string().trim().max(40).default(""),
  line1: z.string().trim().min(1).max(120),
  line2: z.string().trim().max(120).default(""),
  city: z.string().trim().max(80).default(""),
  region: z.string().trim().max(80).default(""),
  postalCode: z.string().trim().max(20).default(""),
  country: z.string().trim().max(80).default(""),
  visible: z.boolean().default(true),
});

export const digitalCardSocialSchema = z
  .object({
    network: z.enum(SOCIAL_NETWORKS),
    label: z.string().trim().max(40).default(""),
    url: z.string().trim().max(300),
    visible: z.boolean().default(true),
  })
  .superRefine((link, ctx) => {
    if (!isHttpUrl(link.url)) {
      ctx.addIssue({ code: "custom", message: "Use an http or https link", path: ["url"] });
    }
    if (link.network === "CUSTOM" && !link.label) {
      ctx.addIssue({ code: "custom", message: "Name this link", path: ["label"] });
    }
  });

export const digitalCardWriteSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  personName: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().max(120).default(""),
  email: optionalEmail.default(""),
  website: optionalWebsite.default(""),
  note: z.string().trim().max(400).default(""),
  theme: cardThemeSchema,
  phones: z.array(digitalCardPhoneSchema).max(8),
  addresses: z.array(digitalCardAddressSchema).max(4),
  socialLinks: z.array(digitalCardSocialSchema).max(12),
});

export const digitalCardCreateSchema = z.object({
  businessName: z.string().trim().min(1).max(120).optional(),
  personName: z.string().trim().min(1).max(120).optional(),
  jobTitle: z.string().trim().max(120).optional(),
  email: optionalEmail.optional(),
  website: optionalWebsite.optional(),
  note: z.string().trim().max(400).optional(),
  theme: cardThemeSchema.partial().optional(),
  phones: z.array(digitalCardPhoneSchema).max(8).optional(),
  addresses: z.array(digitalCardAddressSchema).max(4).optional(),
  socialLinks: z.array(digitalCardSocialSchema).max(12).optional(),
});

export const digitalCardLogoSchema = z.object({
  dataUrl: z.string().min(32).max(4_000_000),
});

export type DigitalCardWrite = z.infer<typeof digitalCardWriteSchema>;
export type DigitalCardCreateInput = z.infer<typeof digitalCardCreateSchema>;
