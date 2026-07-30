/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    outputFileTracingIncludes: {
      "/**": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};
export default nextConfig;
