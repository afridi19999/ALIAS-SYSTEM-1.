import { NextResponse } from "next/server";
import { Repository } from "@/lib/db/repo";

export async function GET(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const { campaignId: rawId } = await params;
    const campaignId = rawId ? rawId.replace(/^[./\\]+|[./\\;,:]+$/g, "") : "";

    if (!campaignId || campaignId.toLowerCase() === "new") {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }

    const campaign = await Repository.getCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    let artifact = await Repository.getArtifact1(campaignId);
    if (!artifact) {
      artifact = await Repository.upsertArtifact1(campaignId, {}, "draft");
    }
    return NextResponse.json({ success: true, artifact });
  } catch (error: any) {
    console.error("[API/Artifact1] Error fetching artifact 1:", error);
    return NextResponse.json(
      { error: "Failed to fetch artifact", details: error.message },
      { status: 500 }
    );
  }
}
