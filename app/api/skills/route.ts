import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import AdmZip from "adm-zip";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";

export async function GET() {
  try {
    const skills = await prisma.skill.findMany({
      include: {
        versions: { orderBy: { createdAt: "desc" }, take: 1 },
        _count: { select: { tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ skills });
  } catch (error) {
    console.error("Skills list error:", error);
    return NextResponse.json(
      { error: "Failed to load skills" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await verifyToken(token);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file || !file.name.endsWith(".zip")) {
      return NextResponse.json(
        { error: "A .zip file is required" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    const skillEntry = entries.find(
      (e) => e.entryName === "SKILL.md" || e.entryName.endsWith("/SKILL.md")
    );
    if (!skillEntry) {
      return NextResponse.json(
        { error: "SKILL.md not found in zip" },
        { status: 400 }
      );
    }

    const skillContent = skillEntry.getData().toString("utf-8");
    const skillName =
      (formData.get("name") as string) || file.name.replace(".zip", "");
    const description = (formData.get("description") as string) || "";

    const skillDirName = `${skillName}-${randomUUID().slice(0, 8)}`;
    const skillDir = path.join(process.cwd(), "storage", "skills", skillDirName);
    await fs.mkdir(skillDir, { recursive: true });
    zip.extractAllTo(skillDir, true);

    const skill = await prisma.skill.create({
      data: {
        name: skillName,
        description,
        source: "user_upload",
        filePath: skillDir,
        version: "1.0.0",
        uploadedBy: userId,
        versions: {
          create: {
            version: "1.0.0",
            content: skillContent,
            changelog: "Initial upload",
          },
        },
      },
      include: { versions: true },
    });

    return NextResponse.json({ skill }, { status: 201 });
  } catch (error) {
    console.error("Skill upload error:", error);
    const message =
      error instanceof Error ? error.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
