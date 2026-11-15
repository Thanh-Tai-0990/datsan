import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Chỉ có tác dụng khi chạy thử trên máy, không ảnh hưởng bản online
  allowedDevOrigins: ["192.168.1.30"],
};

export default nextConfig;