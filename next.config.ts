import type { NextConfig } from "next";

/**
 * PDFKit loads its embedded standard-font modules dynamically at runtime.
 * Next.js/Vercel tracing misses that dynamic dependency unless these files
 * are explicitly included in the proposal function's server bundle.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Native canvas (.node) and PDF.js are runtime Node modules, not Webpack assets.
  serverExternalPackages: ["@napi-rs/canvas","pdfjs-dist","tesseract.js"],
  outputFileTracingIncludes: {
    "/api/proposal/pdf": [
      "./node_modules/pdfkit/js/standard-fonts/**/*",
      "./node_modules/pdfkit/js/data/**/*",
    ],
    "/api/fund-enrichment": [
      "./node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
      "./node_modules/tesseract.js/src/worker-script/node/**/*",
      "./node_modules/tesseract.js-core/**/*",
    ],
  },
};

export default nextConfig;
