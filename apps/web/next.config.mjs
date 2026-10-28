/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Internal packages publish TS source (see package.json "exports"); Next must
  // transpile them until they get their own build step.
  transpilePackages: ["@crm/core", "@crm/db", "@crm/ai", "@crm/docs", "@crm/config"],
};

export default nextConfig;
