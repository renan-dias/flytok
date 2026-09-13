/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // three ships ESM-only helpers; transpile keeps drei happy on Vercel's build.
  transpilePackages: ['three', '@react-three/fiber', '@react-three/drei'],
};

export default nextConfig;
