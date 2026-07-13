import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

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

// HTML 中把外部 script src 替换为 API 路由地址
if (FILE_MAP["html"]) {
  FILE_MAP["html"].content = FILE_MAP["html"].content
    .replace(
      'src="/vendor/simple-mind-map.umd.min.js"',
      'src="/api/editor-assets/simple-mind-map"'
    )
    .replace(
      'src="/vendor/jszip.min.js"',
      'src="/api/editor-assets/jszip"'
    )
    .replace(
      'src="/editor/mind-map.js"',
      'src="/api/editor-assets/mind-map-js"'
    );
}

export async function GET(
  _request: Request,
  { params }: { params: { slug: string } }
) {
  const { slug } = await Promise.resolve(params);
  const asset = FILE_MAP[slug];
  if (!asset) {
    console.log(`[Editor Assets] 404: ${slug}`);
    return new NextResponse("Not found", { status: 404 });
  }
  const sizeKB = Math.round(asset.content.length / 1024);
  console.log(`[Editor Assets] Serving: ${slug} (${sizeKB}KB, ${asset.contentType})`);
  return new NextResponse(asset.content, {
    headers: {
      "Content-Type": `${asset.contentType}; charset=utf-8`,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
