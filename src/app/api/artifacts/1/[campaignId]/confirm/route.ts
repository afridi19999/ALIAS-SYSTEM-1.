import { NextResponse } from "next/server";
import { Repository } from "@/lib/db/repo";

export async function POST(req: Request, { params }: { params: Promise<{ campaignId: string }> }) {
  try {
    const { campaignId } = await params;

    const existingArtifact = await Repository.getArtifact1(campaignId);
    if (!existingArtifact) {
      return NextResponse.json({ error: "Artifact 1 not found for this campaign" }, { status: 404 });
    }

    // Verify all 6 essential requirements are filled
    const missing: string[] = [];
    if (!existingArtifact.client?.company_name) missing.push("Company / Brand Name");
    if (!existingArtifact.product_service?.name) missing.push("Product / Service Name");
    if (!existingArtifact.campaign?.objective) missing.push("Campaign Objective");
    if (!existingArtifact.target_audience?.description && !existingArtifact.target_audience?.location && !existingArtifact.target_audience?.age_range) {
      missing.push("Target Audience");
    }
    const hasBudget = Boolean(existingArtifact.budget?.amount) || existingArtifact.budget?.type === "unknown";
    if (!hasBudget) missing.push("Marketing Budget");
    if (!existingArtifact.timeline?.duration) missing.push("Timeline Duration");

    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Cannot confirm Artifact-1. Please fill all important requirements first: ${missing.join(", ")}.`,
          missingFields: missing,
        },
        { status: 400 }
      );
    }

    const artifact = await Repository.confirmArtifact1(campaignId);
    return NextResponse.json({ success: true, artifact });
  } catch (error: any) {
    console.error("[API/Artifact1/Confirm] Error confirming artifact 1:", error);
    return NextResponse.json(
      { error: "Failed to confirm artifact", details: error.message },
      { status: 500 }
    );
  }
}
