/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produces a self-contained build in .next/standalone — required for Docker
  output: 'standalone',
};

module.exports = nextConfig;
