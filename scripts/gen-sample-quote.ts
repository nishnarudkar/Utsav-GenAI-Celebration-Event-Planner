/**
 * Writes public/samples/sample-caterer-quote.pdf: a one-page quote from the fictional
 * "Shubho Bhoj Caterers", matching the demo fixture emit_quote_extraction.catering.
 * Hand-built PDF, so no dependency. Helvetica has no rupee sign, hence "Rs.".
 * Run with: pnpm tsx scripts/gen-sample-quote.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const LINES: Array<[size: number, text: string]> = [
  [18, "Shubho Bhoj Caterers"],
  [10, "Sample quotation for demonstration. Fictional vendor."],
  [10, ""],
  [12, "Quotation: Wedding dinner, 250 guests"],
  [10, ""],
  [10, "Wedding dinner buffet (Bengali veg & non-veg menu)   250 plates x Rs. 1,770 = Rs. 4,42,500"],
  [10, "Service staff (waiters)   20 x Rs. 800 = Rs. 16,000"],
  [10, "Crockery, cutlery and buffet setup   Included"],
  [10, "Live counters (chaat, fish fry)   Extra, as per actuals"],
  [10, "Transport of food and equipment   Rs. 8,500"],
  [10, ""],
  [12, "Total: Rs. 4,67,000 (GST extra)"],
  [10, ""],
  [11, "Terms"],
  [10, "Live counters charged extra as per actuals"],
  [10, "Overtime after 11:00 PM: Rs. 5,000 per hour"],
  [10, "50% advance at booking, balance 3 days before the event"],
  [10, "Cancellation within 30 days of the event: advance not refundable"],
];

const escapePdf = (s: string) => s.replace(/([\\()])/g, "\\$1");

let y = 790;
const ops = LINES.flatMap(([size, text]) => {
  y -= size + 10;
  return text ? [`BT /F1 ${size} Tf 50 ${y} Td (${escapePdf(text)}) Tj ET`] : [];
}).join("\n");

const objects = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
  `<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`,
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
];

let pdf = "%PDF-1.4\n";
const offsets = objects.map((body, i) => {
  const offset = Buffer.byteLength(pdf);
  pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  return offset;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

const out = path.join(process.cwd(), "public", "samples", "sample-caterer-quote.pdf");
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, pdf);
console.log(`wrote ${path.relative(process.cwd(), out)} (${Buffer.byteLength(pdf)} bytes)`);
