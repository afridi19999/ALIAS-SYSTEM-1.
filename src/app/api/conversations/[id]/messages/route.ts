import { NextResponse } from "next/server";
import { Repository } from "@/lib/db/repo";
import { ConversationAgent } from "@/lib/ai/conversation-agent";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await params;
    const campaignId = rawId ? rawId.replace(/^[./\\]+|[./\\;,:]+$/g, "") : "";
    if (!campaignId || campaignId.toLowerCase() === "new") {
      return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
    }
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
    }
    const userMessage = body.message?.trim();

    if (!userMessage) {
      return NextResponse.json({ error: "Message content cannot be empty" }, { status: 400 });
    }

    const campaign = await Repository.getCampaignById(campaignId);
    if (!campaign) {
      return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    }

    const conversation = await Repository.getConversation(campaignId);
    const conversationId = conversation?._id?.toString() || campaign.conversationId?.toString() || "conv_default";

    // 1. Save user message
    await Repository.createMessage({
      conversationId,
      campaignId,
      sender: "user",
      content: userMessage,
    });

    // 2. Fetch history and current artifact
    const history = await Repository.getMessages(campaignId);
    let artifact = await Repository.getArtifact1(campaignId);
    if (!artifact) {
      artifact = await Repository.upsertArtifact1(campaignId, {}, "draft");
    }

    // 3. Process with Conversation AI Agent (OpenAI or Intelligent Fallback)
    const agentResult = await ConversationAgent.processMessage(
      userMessage,
      history.map((h) => ({ sender: h.sender, content: h.content })),
      artifact
    );

    // 4. Save AI response message with extracted fields
    const aiMessage = await Repository.createMessage({
      conversationId,
      campaignId,
      sender: "ai",
      content: agentResult.ai_message,
      extractedFields: agentResult.extracted_updates,
    });

    // 5. Update Artifact 1 with latest verified facts
    const updatedArtifact = await Repository.upsertArtifact1(
      campaignId,
      agentResult.extracted_updates,
      "draft"
    );

    // 6. If ready for confirmation, update campaign status and persist system message
    let systemMessage = null;
    if (agentResult.status === "ready_for_confirmation") {
      await Repository.updateCampaignStatus(campaignId, "ready_for_confirmation");
      systemMessage = await Repository.createMessage({
        conversationId,
        campaignId,
        sender: "system",
        content:
          "✓ All essential campaign facts have been collected and structured in Artifact-1! Please review the details on the right panel and proceed to confirmation when ready.",
      });
    }

    return NextResponse.json({
      success: true,
      aiMessage,
      systemMessage,
      artifact: updatedArtifact,
      status: agentResult.status,
      missingFields: agentResult.missing_fields,
      quickReplies: agentResult.quick_replies || [],
    });
  } catch (error: any) {
    console.error("[API/Messages] Error processing message:", error);
    return NextResponse.json(
      { error: "Failed to process chat message", details: error.message },
      { status: 500 }
    );
  }
}
