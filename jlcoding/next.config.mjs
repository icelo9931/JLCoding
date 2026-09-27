/** @type {import('next').NextConfig} */
const nextConfig = {
  // esbuild 为原生二进制包，禁止 Next.js 打包进 server bundle（部署打包在 route 中动态引入）
  experimental: {
    serverComponentsExternalPackages: ['esbuild'],
  },
}

export default nextConfig
