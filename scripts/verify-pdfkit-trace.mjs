#!/usr/bin/env node
/**
 * Prevent shipping a serverless PDF route without PDFKit's dynamically loaded
 * font assets. Next.js can otherwise compile successfully but fail at runtime.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(".next/server/app/api/proposal/pdf/route.js.nft.json");
let trace;
try {
  trace = JSON.parse(readFileSync(file, "utf8"));
} catch {
  console.error("PDF build verification failed: route trace is missing.");
  process.exit(1);
}
const listed = Array.isArray(trace.files) ? trace.files : [];
const pdfkitFonts = listed.filter(path => path.includes("pdfkit/js/standard-fonts/"));
const hasHelvetica = pdfkitFonts.some(path => path.endsWith("/Helvetica.cjs"));

if (!hasHelvetica || pdfkitFonts.length < 14) {
  console.error("PDF build verification failed: bundled PDFKit standard fonts are incomplete.");
  process.exit(1);
}
console.log("PDF route font verification passed:", pdfkitFonts.length, "font assets included.");
