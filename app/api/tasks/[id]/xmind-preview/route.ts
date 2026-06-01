import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { getOutputPath, validatePath } from "@/lib/sandbox";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs/promises";

interface XMindTopic {
  title: string;
  children: XMindTopic[];
}

interface XMindSheet {
  title: string;
  rootTopic: XMindTopic;
}

/**
 * Find matching closing tag for a given XML tag name.
 * Handles nested tags of the same name via depth counting.
 */
function findMatchingClose(xml: string, startPos: number, tagName: string): number {
  const openMarker = `<${tagName}`;
  const closeMarker = `</${tagName}>`;
  let depth = 1;
  // Skip past the opening tag's >
  let pos = xml.indexOf(">", startPos) + 1;

  while (pos < xml.length && depth > 0) {
    const nextOpen = xml.indexOf(openMarker, pos);
    const nextClose = xml.indexOf(closeMarker, pos);

    if (nextClose === -1) return -1;

    // Only count <topic (with space/attribute) as nested open, not <topics>
    const isNestedOpen = nextOpen !== -1 && nextOpen < nextClose
      && xml.charAt(nextOpen + openMarker.length) !== "s"; // exclude <topics>

    if (isNestedOpen) {
      depth++;
      pos = nextOpen + openMarker.length;
    } else {
      depth--;
      if (depth === 0) return nextClose + closeMarker.length;
      pos = nextClose + closeMarker.length;
    }
  }

  return -1;
}

/**
 * Parse <topic> elements at the current XML level.
 * Returns array of topics found at this level.
 */
function parseTopicsAtLevel(xml: string): XMindTopic[] {
  const topics: XMindTopic[] = [];
  let pos = 0;

  while (pos < xml.length) {
    const topicStart = xml.indexOf("<topic ", pos);
    if (topicStart === -1) break;

    // Check if any closing tag (</topics> or </children>) comes first
    const nextEnd = xml.indexOf("</", pos);
    if (nextEnd !== -1 && nextEnd < topicStart) break;

    const result = parseOneTopic(xml, topicStart);
    if (!result) break;

    topics.push(result.topic);
    pos = result.endPos;
  }

  return topics;
}

/**
 * Parse a single <topic> element starting at topicStart.
 * Returns the parsed topic and the position after its closing </topic>.
 */
function parseOneTopic(xml: string, topicStart: number): { topic: XMindTopic; endPos: number } | null {
  // Extract <title>...</title>
  const titleMatch = xml.slice(topicStart).match(/<title>([^<]*)<\/title>/);
  if (!titleMatch || titleMatch.index === undefined) return null;

  const title = titleMatch[1]
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, "");

  // Find the matching </topic> close
  const topicEnd = findMatchingClose(xml, topicStart, "topic");
  if (topicEnd === -1) return null;

  let children: XMindTopic[] = [];

  // Look for <children> block within this topic
  const innerXml = xml.slice(topicStart, topicEnd);
  const childrenStart = innerXml.indexOf("<children>");

  if (childrenStart !== -1) {
    const childrenClose = innerXml.indexOf("</children>", childrenStart);
    if (childrenClose !== -1) {
      const childrenXml = innerXml.slice(childrenStart + 10, childrenClose);
      // Skip past <topics ...> wrapper if present
      const topicsStart = childrenXml.indexOf("<topics");
      if (topicsStart !== -1) {
        const topicsContentStart = childrenXml.indexOf(">", topicsStart) + 1;
        children = parseTopicsAtLevel(childrenXml.slice(topicsContentStart));
      }
    }
  }

  return { topic: { title, children }, endPos: topicEnd };
}

/**
 * Extract sheet info from XMind content.xml
 */
function extractSheets(xmlContent: string): XMindSheet[] {
  const sheets: XMindSheet[] = [];

  // Try sheet-based parsing first
  const sheetRegex = /<sheet\s+id="[^"]*">\s*<title>([^<]*)<\/title>([\s\S]*?)<\/sheet>/g;
  let match: RegExpExecArray | null;

  while ((match = sheetRegex.exec(xmlContent)) !== null) {
    const sheetTitle = match[1];
    const sheetXml = match[2];

    // Find root topic
    const rootTopicStart = sheetXml.indexOf("<topic ");
    if (rootTopicStart === -1) continue;

    const result = parseOneTopic(sheetXml, rootTopicStart);
    if (!result) continue;

    sheets.push({
      title: sheetTitle,
      rootTopic: result.topic,
    });
  }

  // Fallback: no sheet structure found, treat whole file as one sheet
  if (sheets.length === 0) {
    const rootTopicStart = xmlContent.indexOf("<topic ");
    if (rootTopicStart !== -1) {
      const result = parseOneTopic(xmlContent, rootTopicStart);
      if (result) {
        sheets.push({
          title: "Sheet 1",
          rootTopic: result.topic,
        });
      }
    }
  }

  return sheets;
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = req.cookies.get("token")?.value;
    await getAuthUser(token);

    const taskId = params.id;
    const fileParam = req.nextUrl.searchParams.get("file");

    if (!fileParam) {
      return NextResponse.json({ error: "Missing file parameter" }, { status: 400 });
    }

    const outputDir = getOutputPath(taskId);
    const filePath = path.resolve(outputDir, fileParam);

    if (!validatePath(filePath, taskId)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const buffer = await fs.readFile(filePath);
    const zip = new AdmZip(buffer);
    const contentEntry = zip.getEntry("content.xml");

    if (!contentEntry) {
      return NextResponse.json({ error: "Invalid XMind file: content.xml not found" }, { status: 400 });
    }

    const xmlContent = contentEntry.getData().toString("utf-8");
    const sheets = extractSheets(xmlContent);

    return NextResponse.json({ sheets });
  } catch (error) {
    console.error("XMind preview error:", error);
    return NextResponse.json({ error: "Failed to parse XMind file" }, { status: 500 });
  }
}
