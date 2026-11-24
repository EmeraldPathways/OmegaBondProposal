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
  },
};

export default nextConfig;
