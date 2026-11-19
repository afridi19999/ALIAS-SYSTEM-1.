import { describe, it, expect, vi, beforeEach } from "vitest";
import mongoose from "mongoose";
import AdminAutoReplyJob from "@/models/AdminAutoReplyJob";
import AdminAiGenerationJob from "@/models/AdminAiGenerationJob";
import AdminClientThread from "@/models/AdminClientThread";
import AdminClientMessage from "@/models/AdminClientMessage";
import AdminCommunicationSettings from "@/models/AdminCommunicationSettings";
import Campaign from "@/models/Campaign";
import Artifact1 from "@/models/Artifact1";
import Artifact2 from "@/models/Artifact2";
import MasterCampaignBrief from "@/models/MasterCampaignBrief";
import { DurableCommunicationWorker } from "@/lib/communication/durable-worker";
import { CommunicationSafetyGuard } from "@/lib/communication/safety-guard";
import { ConversationAgent } from "@/lib/ai/conversation-agent";
import { AdminCommunicationAgent } from "@/lib/ai/admin-communication-agent";
import { PresenceService } from "@/lib/communication/presence-service";

describe("Intake Auto-Reply Exclusion and Parser Guardrails", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.ALLOW_DEMO_AUTH;
    delete process.env.ALLOW_INSECURE_NON_TRANSACTIONAL_FALLBACK;
  });

  const mockTransactionSession = () => {
    vi.spyOn(mongoose, "startSession").mockResolvedValue({
      withTransaction: async (fn: any) => fn(),
      endSession: vi.fn(),
    } as any);
    vi.spyOn(Campaign, "findById").mockResolvedValue(null);
    vi.spyOn(Artifact1, "findById").mockResolvedValue(null);
    vi.spyOn(Artifact1, "findOne").mockReturnValue({ lean: () => Promise.resolve(null) } as any);
    vi.spyOn(Artifact2, "findById").mockResolvedValue(null);
    vi.spyOn(Artifact2, "findOne").mockReturnValue({ lean: () => Promise.resolve(null) } as any);
    vi.spyOn(MasterCampaignBrief, "findById").mockResolvedValue(null);
    vi.spyOn(MasterCampaignBrief, "findOne").mockReturnValue({ lean: () => Promise.resolve(null) } as any);
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: Intake Thread Gets Exactly One Reply Per User Message
  // Threads with threadType="intake" must be excluded from auto-reply scheduling.
  // Suggestions are kept for admin view, but NO auto-reply job is scheduled.
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test 1: Intake thread is excluded from auto-reply scheduling (only intake bot replies)", async () => {
    mockTransactionSession();
    const threadId = new mongoose.Types.ObjectId();
    const campaignId = new mongoose.Types.ObjectId();
    const clientId = new mongoose.Types.ObjectId();
    const messageId = new mongoose.Types.ObjectId();
    const genJobId = new mongoose.Types.ObjectId();

    const intakeThreadDoc: any = {
      _id: threadId,
      campaignId,
      clientId,
      clientName: "Rahim Chowdhury",
      businessName: "Acme Logistics",
      threadType: "intake", // INTAKE THREAD
      threadGeneration: 1,
      adminControlled: false,
      aiAutoReplyAllowed: true,
      perThreadAiEnabled: true,
      save: vi.fn().mockResolvedValue(true),
    };

    const messageDoc: any = {
      _id: messageId,
      threadId,
      campaignId,
      clientId,
      sender: "client",
      content: "Hello, we need lead generation in Dhaka.",
      aiStatus: "PENDING",
      autoReplyStatus: "NOT_SCHEDULED",
      createdAt: new Date(),
    };

    const genJobDoc: any = {
      _id: genJobId,
      threadId,
      threadGeneration: 1,
      messageId,
      status: "PENDING",
      attempts: 0,
      scheduledStartAt: new Date(Date.now() - 1000),
      claimToken: "token_123",
    };

    vi.spyOn(AdminAiGenerationJob, "findOneAndUpdate").mockResolvedValue(genJobDoc as any);
    vi.spyOn(AdminClientThread, "findById").mockResolvedValue(intakeThreadDoc as any);
    vi.spyOn(AdminClientMessage, "findById").mockResolvedValue(messageDoc as any);
    vi.spyOn(AdminClientMessage, "findByIdAndUpdate").mockResolvedValue({} as any);
    vi.spyOn(AdminClientMessage, "find").mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: () => Promise.resolve([messageDoc]),
        }),
      }),
    } as any);

    vi.spyOn(AdminCommunicationSettings, "findOne").mockResolvedValue({
      autoReplyGlobalEnabled: true,
      mode: "ADMIN_AWAY_AUTO_REPLY",
      countdownDurationSeconds: 10,
      settingsRevision: 1,
    } as any);

    // Spy on AdminAutoReplyJob.create: must NOT be called for intake thread!
    const createAutoReplySpy = vi.spyOn(AdminAutoReplyJob, "create");

    const processed = await (DurableCommunicationWorker as any).processAiJob(
      genJobId,
      "worker_test_1"
    );

    expect(processed).toBe(true);
    // CRITICAL: Auto-reply job must NEVER be created for intake thread
    expect(createAutoReplySpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: Intake Thread Dispatch and Recovery Loops Exclude Intake Threads
  // Even if an auto-reply job was queued, processAutoReplyJob cancels it.
  // The recovery loop also skips intake threads.
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test 2: Auto-reply dispatch and recovery loops cancel / skip intake threads", async () => {
    mockTransactionSession();
    vi.spyOn(PresenceService, "getState").mockResolvedValue({
      effectiveMode: "ADMIN_AWAY_AUTO_REPLY",
      settings: { autoReplyGlobalEnabled: true, settingsRevision: 1 } as any,
    } as any);
    const threadId = new mongoose.Types.ObjectId();
    const jobId = new mongoose.Types.ObjectId();

    const intakeThreadDoc: any = {
      _id: threadId,
      threadType: "intake",
      clientName: "Valid Client",
      businessName: "Valid Business",
      adminControlled: false,
      aiAutoReplyAllowed: true,
    };

    const replyJobDoc: any = {
      _id: jobId,
      threadId,
      threadGeneration: 1,
      status: "PENDING",
      scheduledExecuteAt: new Date(Date.now() - 1000),
      proposedReply: "This is a valid reply.",
      claimToken: "claim_123",
    };

    vi.spyOn(AdminAutoReplyJob, "findOneAndUpdate").mockImplementation((query: any, update: any) => {
      if (update?.$set?.status === "CANCELLED") {
        expect(update.$set.cancelledReason).toBe("INTAKE_THREAD_EXCLUDED");
        return Promise.resolve({ ...replyJobDoc, status: "CANCELLED" }) as any;
      }
      return Promise.resolve(replyJobDoc) as any;
    });

    vi.spyOn(AdminClientThread, "findById").mockResolvedValue(intakeThreadDoc as any);

    const dispatched = await (DurableCommunicationWorker as any).processAutoReplyJob(
      jobId,
      "worker_test_2"
    );

    expect(dispatched).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: No Placeholder Strings in Any Sent Auto-Reply
  // If proposed reply or thread contains "Demo Client" or "New Marketing Campaign",
  // skip sending and keep only the suggestion.
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test 3: CommunicationSafetyGuard flags placeholder values", () => {
    const demoClientResult = CommunicationSafetyGuard.evaluate(
      "Thank you for reaching out, Demo Client. We are ready to assist you."
    );
    expect(demoClientResult.passed).toBe(false);
    expect(demoClientResult.flags).toContain("CONTAINS_PLACEHOLDER");

    const newCampaignResult = CommunicationSafetyGuard.evaluate(
      "Regarding your marketing campaign for New Marketing Campaign: we will optimize your ads."
    );
    expect(newCampaignResult.passed).toBe(false);
    expect(newCampaignResult.flags).toContain("CONTAINS_PLACEHOLDER");

    const untitledResult = CommunicationSafetyGuard.evaluate(
      "Regarding Untitled Campaign: our strategy is ready."
    );
    expect(untitledResult.passed).toBe(false);
    expect(untitledResult.flags).toContain("CONTAINS_PLACEHOLDER");

    const cleanResult = CommunicationSafetyGuard.evaluate(
      "Thank you for reaching out. Regarding your marketing campaign for Apex Footwear: our strategy is ready."
    );
    expect(cleanResult.passed).toBe(true);
    expect(cleanResult.flags).not.toContain("CONTAINS_PLACEHOLDER");
  });

  it("Test 4: Auto-reply skipped when clientName or businessName is a placeholder", async () => {
    mockTransactionSession();
    const threadId = new mongoose.Types.ObjectId();
    const campaignId = new mongoose.Types.ObjectId();
    const clientId = new mongoose.Types.ObjectId();
    const messageId = new mongoose.Types.ObjectId();
    const genJobId = new mongoose.Types.ObjectId();

    const placeholderThreadDoc: any = {
      _id: threadId,
      campaignId,
      clientId,
      clientName: "Demo Client", // PLACEHOLDER CLIENT
      businessName: "New Marketing Campaign", // PLACEHOLDER BUSINESS
      threadType: "direct",
      threadGeneration: 1,
      adminControlled: false,
      aiAutoReplyAllowed: true,
      perThreadAiEnabled: true,
      save: vi.fn().mockResolvedValue(true),
    };

    const messageDoc: any = {
      _id: messageId,
      threadId,
      campaignId,
      clientId,
      sender: "client",
      content: "Can you help me scale my sales?",
      aiStatus: "PENDING",
      autoReplyStatus: "NOT_SCHEDULED",
      createdAt: new Date(),
    };

    const genJobDoc: any = {
      _id: genJobId,
      threadId,
      threadGeneration: 1,
      messageId,
      status: "PENDING",
      attempts: 0,
      scheduledStartAt: new Date(Date.now() - 1000),
      claimToken: "token_456",
    };

    vi.spyOn(AdminAiGenerationJob, "findOneAndUpdate").mockResolvedValue(genJobDoc as any);
    vi.spyOn(AdminClientThread, "findById").mockResolvedValue(placeholderThreadDoc as any);
    vi.spyOn(AdminClientMessage, "findById").mockResolvedValue(messageDoc as any);
    vi.spyOn(AdminClientMessage, "findByIdAndUpdate").mockResolvedValue({} as any);
    vi.spyOn(AdminClientMessage, "find").mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: () => Promise.resolve([messageDoc]),
        }),
      }),
    } as any);

    vi.spyOn(AdminCommunicationSettings, "findOne").mockResolvedValue({
      autoReplyGlobalEnabled: true,
      mode: "ADMIN_AWAY_AUTO_REPLY",
      countdownDurationSeconds: 10,
      settingsRevision: 1,
    } as any);

    const createAutoReplySpy = vi.spyOn(AdminAutoReplyJob, "create");

    await (DurableCommunicationWorker as any).processAiJob(genJobId, "worker_test_placeholder");

    // Auto-reply must NOT be created when client or campaign is a placeholder
    expect(createAutoReplySpy).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: Intake Parser treats "5-30 year mans" as Target Audience Age Range,
  // NOT Campaign Duration!
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test 5: Intake parser extracts 5-30 as audience age range and does NOT set duration to 30 Years", async () => {
    const rawUserMessage = "my company name is xyz and our targated audience is 5-30 year mans";
    const priorHistory: any[] = [
      {
        sender: "ai",
        content: "To formulate your campaign, what is your company or brand name?",
      },
    ];
    const currentArtifact: any = {
      client: {},
      product_service: {},
      campaign: {},
      target_audience: {},
      budget: {},
      timeline: {},
    };

    const result = await ConversationAgent.processMessage(
      rawUserMessage,
      priorHistory,
      currentArtifact
    );

    // 1. Company name should be Xyz
    expect(result.extracted_updates?.client?.company_name).toBe("Xyz");

    // 2. Audience age range must be extracted as 5-30
    expect(result.extracted_updates?.target_audience?.age_range).toBe("5-30");

    // 3. Duration must NOT be set to "30 Years"!
    expect(result.extracted_updates?.timeline?.duration).toBeUndefined();

    // 4. AI message should not say "Duration set to 30 Years"
    expect(result.ai_message).not.toContain("Duration set to 30 Years");
    expect(result.ai_message).not.toContain("30 Years");
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: Reply Context Comes From Current Thread Only (No UrbanThread Leak)
  // ─────────────────────────────────────────────────────────────────────────────
  it("Test 6: Reply context is isolated to current thread and does not bleed UrbanThread", async () => {
    const suggestionsResult = await AdminCommunicationAgent.generateSuggestions({
      clientMessage: "my company name is xyz and our targated audience is 5-30 year mans",
      clientName: "Demo Client",
      businessName: "New Marketing Campaign",
      recentMessages: [
        {
          sender: "client",
          content: "my company name is xyz and our targated audience is 5-30 year mans",
        },
      ],
      // Stale artifact from earlier UrbanThread session
      artifact1: {
        client: { company_name: "UrbanThread" },
        product_service: { name: "UrbanThread (Streetwear)", category: "Streetwear" },
      },
    });

    // 1. Must NOT contain placeholder strings
    expect(suggestionsResult.suggestions.professional).not.toContain("Demo Client");
    expect(suggestionsResult.suggestions.professional).not.toContain("New Marketing Campaign");
    expect(suggestionsResult.suggestions.friendly).not.toContain("Demo Client");
    expect(suggestionsResult.suggestions.friendly).not.toContain("New Marketing Campaign");

    // 2. Must NOT bleed UrbanThread or clothing lookbook metrics into the Xyz commercial thread
    expect(suggestionsResult.suggestions.professional).not.toContain("UrbanThread");
    expect(suggestionsResult.suggestions.professional).not.toContain("lookbook");
    expect(suggestionsResult.suggestions.professional).not.toContain("collection sell-through");

    // 3. Must address Xyz or generic professional brand
    expect(
      suggestionsResult.suggestions.professional.includes("xyz") ||
      suggestionsResult.suggestions.professional.includes("Xyz") ||
      suggestionsResult.suggestions.professional.includes("your brand")
    ).toBe(true);
  });
});
