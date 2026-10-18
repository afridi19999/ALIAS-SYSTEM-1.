import { NextResponse } from "next/server";
import { Repository } from "@/lib/db/repo";

export async function POST(req: Request) {
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const name = body.name || "New Marketing Campaign";

    // Get or create client
    const client = await Repository.getOrCreateDemoClient();
    const clientId = client._id ? client._id.toString() : String(client.id);

    // Create campaign and conversation
    const result = await Repository.createCampaign(name, clientId);

    const storageMode = await Repository.getStorageMode();

    return NextResponse.json({
      success: true,
      campaignId: result.campaignId,
      conversationId: result.conversationId,
      storageMode,
    });
  } catch (error: any) {
    console.error("[API/Campaigns] Error creating campaign:", error);
    return NextResponse.json(
      { error: "Failed to create campaign", details: error.message || "Unknown error" },
      { status: 500 }
    );
  }
}
