const os = require("os");

// 启动时动态收集所有本机 IPv4 地址（含 localhost / 127.0.0.1 / 局域网 IP），
// 加到 allowedDevOrigins，避免局域网访问 dev server 时 non-GET 请求被拦截。
function collectLocalOrigins() {
  const origins = new Set(["localhost", "127.0.0.1"]);
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    if (!iface) continue;
    for (const info of iface) {
      if (info.family === "IPv4" && !info.internal) {
        origins.add(info.address);
      }
    }
  }
  const list = Array.from(origins);
  if (process.env.NODE_ENV !== "production") {
    console.log("  ▲ allowedDevOrigins:", list.join(", "));
  }
  return list;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: collectLocalOrigins(),
  reactStrictMode: true,
  output: "standalone",
};

module.exports = nextConfig;
