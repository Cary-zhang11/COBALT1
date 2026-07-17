import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * 构建时将编辑器资源嵌入 bundle，运行时零 IO。
 * HTML 极小（<1KB），JS 库由浏览器并行加载、可缓存。
 */
const PUBLIC_DIR = path.join(process.cwd(), "public");

const FILE_MAP: Record<string, { content: string; contentType: string }> = {};

const ASSETS: [string, string, string][] = [
  ["simple-mind-map", "vendor/simple-mind-map.umd.min.js", "application/javascript"],
  ["jszip", "vendor/jszip.min.js", "application/javascript"],
  ["mind-map-js", "editor/mind-map.js", "application/javascript"],
  ["html", "editor/mind-map.html", "text/html"],
];

for (const [slug, filePath, contentType] of ASSETS) {
  try {
    const content = fs.readFileSync(path.join(PUBLIC_DIR, filePath), "utf-8");
    FILE_MAP[slug] = { content, contentType };
    console.log(`[Editor Assets] Inlined: ${slug} (${Math.round(content.length / 1024)}KB)`);
  } catch (err: any) {
    console.error(`[Editor Assets] Failed to inline: ${slug} - ${err?.message}`);
  }
}

// 注意: HTML 内脚本路径已在 public/editor/mind-map.html 中写为 API 路由
export async function GET(
  request: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = await Promise.resolve(params);
  const asset = FILE_MAP[slug];
  if (!asset) {
    console.log(`[Editor Assets] 404: ${slug}`);
    return new NextResponse("Not found", { status: 404 });
  }

  // 支持 ETag 条件请求：用内容 hash 作为校验值
  const hash = crypto.createHash("md5").update(asset.content).digest("hex").substring(0, 16);
  const etag = `"${slug}-${asset.content.length}-${hash}"`;
  const ifNoneMatch = request.headers.get("if-none-match");

  const sizeKB = Math.round(asset.content.length / 1024);
  const cacheControl = asset.contentType.includes("javascript")
    ? "public, max-age=86400, immutable"
    : "public, max-age=60";

  // 如果 ETag 匹配，返回 304 Not Modified（浏览器用缓存，不传响应体）
  if (ifNoneMatch === etag) {
    console.log(`[Editor Assets] 304: ${slug} (cached)`);
    return new NextResponse(null, {
      status: 304,
      headers: {
        "Cache-Control": cacheControl,
        ETag: etag,
      },
    });
  }

  console.log(`[Editor Assets] Serving: ${slug} (${sizeKB}KB, ${asset.contentType})`);
  return new NextResponse(asset.content, {
    headers: {
      "Content-Type": `${asset.contentType}; charset=utf-8`,
      "Cache-Control": cacheControl,
      ETag: etag,
    },
  });
}
