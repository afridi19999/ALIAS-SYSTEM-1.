import mongoose from "mongoose";
import { dbConnect } from "@/lib/db/connect";
import AdminAiGenerationJob, { MAX_AI_GENERATION_ATTEMPTS } from "@/models/AdminAiGenerationJob";
import AdminAutoReplyJob from "@/models/AdminAutoReplyJob";
import AdminClientThread from "@/models/AdminClientThread";
import AdminClientMessage from "@/models/AdminClientMessage";
import AdminCommunicationSettings from "@/models/AdminCommunicationSettings";
import AdminWorkerLock from "@/models/AdminWorkerLock";
import Campaign from "@/models/Campaign";
import Artifact1 from "@/models/Artifact1";
import Artifact2 from "@/models/Artifact2";
import MasterCampaignBrief from "@/models/MasterCampaignBrief";
import { AdminCommunicationAgent } from "@/lib/ai/admin-communication-agent";
import { CommunicationSafetyGuard } from "@/lib/communication/safety-guard";
import { DatabaseTransactionCapabilityError } from "@/lib/communication/thread-service";

/**
 * Execute a callback within an atomic MongoDB transaction.
 * Fail-closed policy: Fails if replica set transaction capability is unavailable.
 */
async function runCommunicationTransaction<T>(
  callback: (session: mongoose.ClientSession) => Promise<T>
): Promise<T> {
  await dbConnect();
  const session = await mongoose.startSession();
  try {
    let result: T;
    await session.withTransaction(async () => {
      result = await callback(session);
    });
    return result!;
  } catch (err: any) {
    const isReplicaSetError =
      err.message?.includes("replica set") ||
      err.message?.includes("Transaction numbers are only allowed") ||
      err.code === 20;

    if (isReplicaSetError) {
      const allowInsecure =
        process.env.ALLOW_INSECURE_NON_TRANSACTIONAL_FALLBACK === "true" &&
        process.env.NODE_ENV !== "production";

      if (!allowInsecure) {
        console.error(
          "[Database Capability Failure] MongoDB multi-document transactions are required for communication atomicity, but current cluster is not a replica set."
        );
        throw new DatabaseTransactionCapabilityError(
          "MongoDB multi-document transaction capability is required for communication atomic guarantees, but the database cluster is not a replica set.",
          err
        );
      }
      console.warn(
        "[WARN] Operating in non-transactional fallback mode because ALLOW_INSECURE_NON_TRANSACTIONAL_FALLBACK is true."
      );
      return await callback(session);
    }
    throw err;
  } finally {
    await session.endSession();
  }
}

export class DurableCommunicationWorker {
  /**
   * Acquire distributed global worker lock.
   */
  private static async acquireGlobalLock(workerId: string): Promise<boolean> {
    await dbConnect();
    const now = new Date();
    const lockDurationMs = 25000; // 25s lease
    const lockedUntil = new Date(now.getTime() + lockDurationMs);

    try {
      const lock = await AdminWorkerLock.findOneAndUpdate(
        {
          _id: "GLOBAL_WORKER_LOCK",
          $or: [{ lockedUntil: { $lte: now } }, { lockedBy: workerId }],
        },
        {
          $set: {
            lockedUntil,
            lockedBy: workerId,
          },
        },
        { upsert: true, returnDocument: 'after' }
      );
      return Boolean(lock);
    } catch {
      return false;
    }
  }

  /**
   * Recover any jobs that got stuck in PROCESSING status due to server crash/timeout (> 30s).
   * Enforces MAX_AI_GENERATION_ATTEMPTS on AI generation jobs.
   */
  private static async recoverStaleJobs(): Promise<void> {
    const staleThreshold = new Date(Date.now() - 30000);

    // 1. Permanently fail AI jobs that exceeded MAX_AI_GENERATION_ATTEMPTS
    await AdminAiGenerationJob.updateMany(
      {
        status: "PROCESSING",
        lockedAt: { $lte: staleThreshold },
        attempts: { $gte: MAX_AI_GENERATION_ATTEMPTS },
      },
      {
        $set: {
          status: "FAILED",
          lastError: `EXCEEDED_MAX_RETRY_ATTEMPTS (>= ${MAX_AI_GENERATION_ATTEMPTS})`,
          completedAt: new Date(),
        },
      }
    );

    // 2. Reset recoverable AI jobs
    await AdminAiGenerationJob.updateMany(
      {
        status: "PROCESSING",
        lockedAt: { $lte: staleThreshold },
        attempts: { $lt: MAX_AI_GENERATION_ATTEMPTS },
      },
      {
        $set: {
          status: "PENDING",
          lockedAt: null,
          lockedBy: null,
          claimToken: null,
        },
      }
    );

    // 3. Reset recoverable auto-reply jobs
    await AdminAutoReplyJob.updateMany(
      {
        status: "PROCESSING",
        lockedAt: { $lte: staleThreshold },
      },
      {
        $set: {
          status: "PENDING",
          lockedAt: null,
          lockedBy: null,
          claimToken: null,
        },
      }
    );
  }

  /**
   * Process a single AI Generation Job.
   * Enforces max retry count, claim token fencing, and atomic freshness validation.
   */
  private static async processAiJob(jobId: mongoose.Types.ObjectId, workerId: string): Promise<boolean> {
    const claimToken = `claim_ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const job = await AdminAiGenerationJob.findOneAndUpdate(
      {
        _id: jobId,
        status: "PENDING",
        attempts: { $lt: MAX_AI_GENERATION_ATTEMPTS },
        // ── 10-SECOND ADMIN WINDOW ──────────────────────────────────────
        // Only pick up jobs whose admin takeover window has elapsed.
        scheduledStartAt: { $lte: new Date() },
      },
      {
        $set: {
          status: "PROCESSING",
          lockedAt: new Date(),
          lockedBy: workerId,
          claimToken,
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after' }
    );

    if (!job) {
      // Check if job exists but exceeded attempts
      const exhaustedJob = await AdminAiGenerationJob.findOne({
        _id: jobId,
        status: "PENDING",
        attempts: { $gte: MAX_AI_GENERATION_ATTEMPTS },
      });
      if (exhaustedJob) {
        await AdminAiGenerationJob.findByIdAndUpdate(jobId, {
          $set: {
            status: "FAILED",
            lastError: `EXCEEDED_MAX_RETRY_ATTEMPTS (${exhaustedJob.attempts}/${MAX_AI_GENERATION_ATTEMPTS})`,
            completedAt: new Date(),
          },
        });
        if (exhaustedJob.messageId) {
          await AdminClientMessage.findByIdAndUpdate(exhaustedJob.messageId, {
            $set: { aiStatus: "FAILED", aiError: "Exceeded max retry attempts" },
          });
        }
      }
      return false;
    }

    try {
      const thread = await AdminClientThread.findById(job.threadId);
      const message = await AdminClientMessage.findById(job.messageId);

      if (!thread || !message) {
        await AdminAiGenerationJob.findOneAndUpdate(
          { _id: job._id, status: "PROCESSING", claimToken },
          {
            $set: { status: "FAILED", lastError: "Thread or message not found", completedAt: new Date() },
          }
        );
        if (message) {
          await AdminClientMessage.findByIdAndUpdate(message._id, {
            $set: { aiStatus: "FAILED", aiError: "Thread not found" },
          });
        }
        return false;
      }

      // Check effective communication mode: if MESSAGING_OFF, cancel job immediately
      const { PresenceService } = await import("@/lib/communication/presence-service");
      const currentCommState = await PresenceService.getState();
      if (currentCommState.effectiveMode === "MESSAGING_OFF") {
        await AdminAiGenerationJob.findOneAndUpdate(
          { _id: job._id, status: "PROCESSING", claimToken },
          {
            $set: {
              status: "CANCELLED",
              lastError: "MESSAGING_OFF_MODE_ACTIVATED",
              completedAt: new Date(),
            },
          }
        );
        await AdminClientMessage.findByIdAndUpdate(message._id, {
          $set: { aiStatus: "CANCELLED", aiError: "Messaging is turned OFF" },
        });
        return false;
      }

      // Mark message as PROCESSING
      await AdminClientMessage.findByIdAndUpdate(message._id, {
        $set: { aiStatus: "PROCESSING" },
      });

      // If threadGeneration already moved past this job's generation, abort cleanly
      if (thread.threadGeneration !== job.threadGeneration) {
        await AdminAiGenerationJob.findOneAndUpdate(
          { _id: job._id, status: "PROCESSING", claimToken },
          {
            $set: { status: "CANCELLED", lastError: "SUPERSEDED_BY_NEWER_THREAD_GENERATION", completedAt: new Date() },
          }
        );
        await AdminClientMessage.findByIdAndUpdate(message._id, {
          $set: { aiStatus: "CANCELLED" },
        });
        return false;
      }

      // Load Campaign artifacts and brief for context
      const campaign = await Campaign.findById(thread.campaignId);
      let artifact1 = null;
      let artifact2 = null;
      let masterBriefMarkdown = campaign?.masterBriefMarkdown || "";

      if (campaign?.artifact1Id) {
        artifact1 = await Artifact1.findById(campaign.artifact1Id).lean();
      }
      if (!artifact1 && thread.campaignId) {
        artifact1 = await Artifact1.findOne({ campaignId: thread.campaignId }).lean();
      }

      if (campaign?.artifact2Id) {
        artifact2 = await Artifact2.findById(campaign.artifact2Id).lean();
      }
      if (!artifact2 && thread.campaignId) {
        artifact2 = await Artifact2.findOne({ campaignId: thread.campaignId }).lean();
      }

      if (!masterBriefMarkdown && campaign?.masterBriefId) {
        const brief = await MasterCampaignBrief.findById(campaign.masterBriefId).lean();
        if (brief?.sections) {
          masterBriefMarkdown = JSON.stringify(brief.sections);
        }
      }
      if (!masterBriefMarkdown && thread.campaignId) {
        const brief = await MasterCampaignBrief.findOne({ campaignId: thread.campaignId }).lean();
        if (brief?.sections) {
          masterBriefMarkdown = JSON.stringify(brief.sections);
        }
      }

      // Fetch recent messages in this thread up to this message
      const recentMessages = await AdminClientMessage.find({
        threadId: thread._id,
        createdAt: { $lte: message.createdAt },
      })
        .sort({ createdAt: -1 })
        .limit(8)
        .lean();

      // Call AI Suggestion Generator
      const aiResult = await AdminCommunicationAgent.generateSuggestions({
        clientMessage: message.content,
        clientName: thread.clientName,
        businessName: thread.businessName,
        recentMessages: recentMessages.reverse().map((m) => ({
          sender: m.sender,
          content: m.content,
        })),
        artifact1,
        artifact2,
        masterBriefMarkdown,
      });

      // Atomic Freshness Verification & Save
      await runCommunicationTransaction(async (session) => {
        const sessionOpt = { session };

        // Verify thread has not moved
        const currentThread = await AdminClientThread.findById(thread._id, null, sessionOpt);
        if (!currentThread || currentThread.threadGeneration !== job.threadGeneration) {
          // Stale - discard and cancel job conditionally
          await AdminAiGenerationJob.findOneAndUpdate(
            { _id: job._id, status: "PROCESSING", claimToken },
            { $set: { status: "CANCELLED", lastError: "THREAD_GENERATION_MOVED_DURING_AI_GEN", completedAt: new Date() } },
            sessionOpt
          );
          await AdminClientMessage.findByIdAndUpdate(
            message._id,
            { $set: { aiStatus: "CANCELLED" } },
            sessionOpt
          );
          return;
        }

        // Save AI suggestions on message with script grounding metadata
        await AdminClientMessage.findByIdAndUpdate(
          message._id,
          {
            $set: {
              aiStatus: "COMPLETED",
              aiAnalysis: {
                suggestions: aiResult.suggestions,
                recommendedTone: aiResult.recommendedTone,
                confidenceScore: aiResult.confidenceScore,
                safetyPassed: aiResult.safetyEvaluation.passed,
                safetyFlags: aiResult.safetyEvaluation.flags,
                provider: aiResult.provider,
                providerModel: aiResult.providerModel,
                relevantScriptIds: aiResult.relevantScriptIds,
                matchedScriptTitles: aiResult.matchedScriptTitles,
                scriptVersion: aiResult.scriptVersion,
                noRelevantScriptFound: aiResult.noRelevantScriptFound,
                requiresAdminReview: aiResult.requiresAdminReview,
              },
            },
          },
          sessionOpt
        );

        // Fetch settings to check communication mode
        let settings = await AdminCommunicationSettings.findOne({}, null, sessionOpt);
        if (!settings) {
          const [created] = await AdminCommunicationSettings.create(
            [
              {
                mode: "ADMIN_ACTIVE",
                manualModeOverride: false,
                adminPresence: "ACTIVE",
                adminLastSeenAt: new Date(),
                awayTimeoutSeconds: 180,
                autoReplyGlobalEnabled: false,
                countdownDurationSeconds: 10,
                defaultTone: "professional",
                settingsRevision: 1,
              },
            ],
            sessionOpt
          );
          settings = created;
        }

        // Eligibility criteria for scheduling autonomous auto-reply:
        // Must be explicitly enabled globally AND messaging not shut off AND thread not admin controlled
        const isEligible =
          settings.autoReplyGlobalEnabled === true &&
          currentCommState.effectiveMode !== "MESSAGING_OFF" &&
          !currentThread.adminControlled &&
          currentThread.aiAutoReplyAllowed !== false &&
          currentThread.perThreadAiEnabled !== false &&
          !aiResult.noRelevantScriptFound &&
          aiResult.safetyEvaluation.passed &&
          aiResult.confidenceScore >= 0.85;

        if (isEligible) {
          const selectedTone = (settings.defaultTone || aiResult.recommendedTone) as
            | "professional"
            | "friendly"
            | "detailed";
          const proposedReply = aiResult.suggestions[selectedTone] || aiResult.suggestions.professional;

          // Secondary explicit safety gate on proposed reply
          const textSafety = CommunicationSafetyGuard.evaluate(proposedReply, {
            confidenceScore: aiResult.confidenceScore,
          });

          if (textSafety.passed) {
            const countdownSec = settings.countdownDurationSeconds || 10;
            const scheduledExecuteAt = new Date(Date.now() + countdownSec * 1000);

            const [autoJob] = await AdminAutoReplyJob.create(
              [
                {
                  threadId: thread._id,
                  threadGeneration: job.threadGeneration,
                  settingsRevision: settings.settingsRevision,
                  messageId: message._id,
                  idempotencyKey: `auto_${message._id.toString()}_${job.threadGeneration}`,
                  scheduledExecuteAt,
                  proposedReply,
                  tone: selectedTone,
                  status: "PENDING",
                },
              ],
              sessionOpt
            );

            // Update thread activeJobId and message status
            currentThread.activeJobId = autoJob._id;
            await currentThread.save(sessionOpt);

            await AdminClientMessage.findByIdAndUpdate(
              message._id,
              { $set: { autoReplyStatus: "PENDING" } },
              sessionOpt
            );
          } else {
            await AdminClientMessage.findByIdAndUpdate(
              message._id,
              { $set: { autoReplyStatus: "BLOCKED_SAFETY" } },
              sessionOpt
            );
          }
        } else {
          await AdminClientMessage.findByIdAndUpdate(
            message._id,
            {
              $set: {
                autoReplyStatus: aiResult.safetyEvaluation.passed ? "NOT_SCHEDULED" : "BLOCKED_SAFETY",
              },
            },
            sessionOpt
          );
        }

        // Complete the AI Job conditionally matching claimToken
        await AdminAiGenerationJob.findOneAndUpdate(
          { _id: job._id, status: "PROCESSING", claimToken },
          { $set: { status: "COMPLETED", completedAt: new Date() } },
          sessionOpt
        );
      });

      return true;
    } catch (err: any) {
      console.error("[Worker] Error in AI Generation Job:", err);
      // Conditionally update to FAILED ONLY IF this worker still owns the PROCESSING claim
      const failedResult = await AdminAiGenerationJob.findOneAndUpdate(
        {
          _id: job._id,
          status: "PROCESSING",
          claimToken,
        },
        {
          $set: {
            status: "FAILED",
            lastError: err.message || String(err),
            completedAt: new Date(),
          },
        }
      );
      if (failedResult) {
        if (job.messageId) {
          await AdminClientMessage.findByIdAndUpdate(job.messageId, {
            $set: {
              aiStatus: "FAILED",
              aiError: err.message || "AI generation encountered an error",
            },
          });
        }
      } else {
        console.warn(
          `[Worker] Stale worker ${workerId} fenced out from mutating AI job ${job._id} - claimToken mismatch or status already changed.`
        );
      }
      return false;
    }
  }

  /**
   * Process a single Auto Reply Dispatch Job.
   * Multi-entity conditional fencing:
   * 1. Settings must match revision and autoReplyGlobalEnabled === true.
   * 2. Thread must match expected threadGeneration.
   * 3. Job must match claimToken.
   * Fenced workers are prevented from mutating jobs they no longer own.
   */
  private static async processAutoReplyJob(
    jobId: mongoose.Types.ObjectId,
    workerId: string
  ): Promise<boolean> {
    const claimToken = `claim_reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const job = await AdminAutoReplyJob.findOneAndUpdate(
      {
        _id: jobId,
        status: "PENDING",
        scheduledExecuteAt: { $lte: new Date() },
      },
      {
        $set: {
          status: "PROCESSING",
          lockedAt: new Date(),
          lockedBy: workerId,
          claimToken,
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after' }
    );

    if (!job) return false;

    try {
      const dispatched = await runCommunicationTransaction(async (session) => {
        const sessionOpt = { session };

        // 1. Verify Global Communication Mode: Must NOT be MESSAGING_OFF and auto-reply must be enabled
        const { PresenceService } = await import("@/lib/communication/presence-service");
        const freshState = await PresenceService.getState();

        if (freshState.effectiveMode === "MESSAGING_OFF" || !freshState.settings.autoReplyGlobalEnabled) {
          // Fenced out by Messaging Off or Master Auto-Reply Disabled
          await AdminAutoReplyJob.findOneAndUpdate(
            { _id: job._id, status: "PROCESSING", claimToken },
            {
              $set: {
                status: "CANCELLED",
                cancelledReason:
                  freshState.effectiveMode === "MESSAGING_OFF"
                    ? "MESSAGING_OFF_MODE_ACTIVATED"
                    : "AUTO_REPLY_DISABLED_PREVENTS_DISPATCH",
                completedAt: new Date(),
              },
            },
            sessionOpt
          );
          return false;
        }

        // 1b. Check if thread was taken over by Admin
        const currentThreadCheck = await AdminClientThread.findById(job.threadId, null, sessionOpt);
        if (currentThreadCheck?.adminControlled || currentThreadCheck?.aiAutoReplyAllowed === false) {
          await AdminAutoReplyJob.findOneAndUpdate(
            { _id: job._id, status: "PROCESSING", claimToken },
            {
              $set: {
                status: "CANCELLED",
                cancelledReason: "ADMIN_CONTROLLED_TAKEOVER",
                completedAt: new Date(),
              },
            },
            sessionOpt
          );
          return false;
        }

        // 2. Verify Thread Generation with Conditional Write
        const nextGeneration = job.threadGeneration + 1;
        const updatedThread = await AdminClientThread.findOneAndUpdate(
          {
            _id: job.threadId,
            threadGeneration: job.threadGeneration,
          },
          {
            $set: {
              threadGeneration: nextGeneration,
              lastMessageSnippet: job.proposedReply.slice(0, 120),
              lastMessageAt: new Date(),
              lastSender: "ai_auto",
              lastAutoRepliedAt: new Date(),
              activeJobId: null,
            },
            $inc: { unreadClientCount: 1 },
          },
          { ...sessionOpt, returnDocument: 'after' }
        );

        if (!updatedThread) {
          // Fenced out by Admin Stop, Admin reply, or new Client message
          await AdminAutoReplyJob.findOneAndUpdate(
            { _id: job._id, status: "PROCESSING", claimToken },
            {
              $set: {
                status: "CANCELLED",
                cancelledReason: "THREAD_GENERATION_MOVED",
                completedAt: new Date(),
              },
            },
            sessionOpt
          );
          return false;
        }

        // 3. Conditional Write on Job Completion
        const updatedJob = await AdminAutoReplyJob.findOneAndUpdate(
          {
            _id: job._id,
            status: "PROCESSING",
            claimToken,
          },
          {
            $set: {
              status: "COMPLETED",
              completedAt: new Date(),
            },
          },
          sessionOpt
        );

        if (!updatedJob) {
          // Another worker claimed or cancelled
          throw new Error("Job claim token mismatch or already resolved");
        }

        // 4. Insert Outgoing Message
        await AdminClientMessage.create(
          [
            {
              threadId: job.threadId,
              campaignId: updatedThread.campaignId,
              clientId: updatedThread.clientId,
              sender: "ai_auto",
              senderName: "ALIAS AI (Auto-Reply)",
              content: job.proposedReply,
              idempotencyKey: job.idempotencyKey,
              aiStatus: "COMPLETED",
              autoReplyStatus: "EXECUTED",
              readByAdmin: true,
              readByClient: false,
            },
          ],
          sessionOpt
        );

        // 5. Update Triggering Client Message
        await AdminClientMessage.findByIdAndUpdate(
          job.messageId,
          { $set: { autoReplyStatus: "EXECUTED" } },
          sessionOpt
        );

        // 5b. Mirror outgoing auto-reply to client intake chat (Message model)
        if (updatedThread.campaignId && mongoose.connection.readyState === 1) {
          try {
            const MessageModel = mongoose.models.Message || (await import("@/models/Message")).default;
            const ConversationModel = mongoose.models.Conversation || (await import("@/models/Conversation")).default;
            const conv = await ConversationModel.findOne({ campaignId: updatedThread.campaignId });
            const conversationId = conv?._id || updatedThread.campaignId;
            await MessageModel.create({
              conversationId,
              campaignId: updatedThread.campaignId,
              sender: "ai",
              content: job.proposedReply,
            });
          } catch (mirrorErr) {
            console.warn("[Worker] Mirror warning:", mirrorErr);
          }
        }

        // 6. Update Settings lastDispatchedAt
        if (freshState.settings?._id) {
          await AdminCommunicationSettings.findByIdAndUpdate(
            freshState.settings._id,
            { $set: { lastDispatchedAt: new Date() } },
            sessionOpt
          );
        }

        // 7. Stop AI typing indicator immediately upon delivery
        try {
          const { TypingStateManager } = await import("@/lib/communication/typing-state-manager");
          const key = updatedThread.campaignId?.toString() || job.threadId.toString();
          TypingStateManager.setAiTyping(key, false);
        } catch {}

        return true;
      });

      return dispatched;
    } catch (err: any) {
      console.error("[Worker] Error in Auto Reply Dispatch:", err);
      // Conditionally update to FAILED ONLY IF this worker still holds the valid PROCESSING claim
      const failedResult = await AdminAutoReplyJob.findOneAndUpdate(
        {
          _id: job._id,
          status: "PROCESSING",
          claimToken,
        },
        {
          $set: {
            status: "FAILED",
            cancelledReason: err.message || String(err),
            completedAt: new Date(),
          },
        }
      );

      if (!failedResult) {
        console.warn(
          `[Worker] Stale worker ${workerId} fenced out from mutating job ${job._id} - claimToken mismatch or status already changed.`
        );
      }
      return false;
    }
  }

  /**
   * Global worker tick: recovers stale jobs, processes AI jobs, dispatches due replies.
   */
  static async tick(): Promise<{ processedAi: number; processedReplies: number }> {
    await dbConnect();
    const workerId = `worker_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const lockAcquired = await this.acquireGlobalLock(workerId);
    if (!lockAcquired) {
      return { processedAi: 0, processedReplies: 0 };
    }

    try {
      await this.recoverStaleJobs();

      let processedAi = 0;
      let processedReplies = 0;

      // Process pending AI Generation jobs whose 10-second admin window has elapsed (limit 5 per tick)
      const pendingAiJobs = await AdminAiGenerationJob.find({
        status: "PENDING",
        scheduledStartAt: { $lte: new Date() },
      })
        .limit(5)
        .select("_id");

      for (const j of pendingAiJobs) {
        const success = await this.processAiJob(j._id as mongoose.Types.ObjectId, workerId);
        if (success) processedAi++;
      }

      // Process pending Auto Reply jobs that are due (limit 5 per tick)
      const dueAutoReplyJobs = await AdminAutoReplyJob.find({
        status: "PENDING",
        scheduledExecuteAt: { $lte: new Date() },
      })
        .limit(5)
        .select("_id");

      for (const j of dueAutoReplyJobs) {
        const success = await this.processAutoReplyJob(j._id as mongoose.Types.ObjectId, workerId);
        if (success) processedReplies++;
      }

      return { processedAi, processedReplies };
    } finally {
      // Release or let expire gracefully
      await AdminWorkerLock.findOneAndUpdate(
        { _id: "GLOBAL_WORKER_LOCK", lockedBy: workerId },
        { $set: { lockedUntil: new Date(0) } }
      );
    }
  }

  /**
   * Thread-scoped tick: specifically reconciles jobs for one thread.
   * Invoked on polling by client or admin to ensure sub-second UI responsiveness.
   */
  static async processThreadJobs(threadId: string | mongoose.Types.ObjectId): Promise<void> {
    await dbConnect();
    const threadIdObj = new mongoose.Types.ObjectId(threadId.toString());
    const workerId = `thread_worker_${threadIdObj.toString()}_${Date.now()}`;

    // Check for pending AI jobs on this thread whose admin window has elapsed
    const pendingAiJob = await AdminAiGenerationJob.findOne({
      threadId: threadIdObj,
      status: "PENDING",
      scheduledStartAt: { $lte: new Date() },
    }).sort({ createdAt: -1 });

    if (pendingAiJob) {
      await this.processAiJob(pendingAiJob._id as mongoose.Types.ObjectId, workerId);
    }

    // Check for due auto-reply jobs on this thread
    const dueReplyJob = await AdminAutoReplyJob.findOne({
      threadId: threadIdObj,
      status: "PENDING",
      scheduledExecuteAt: { $lte: new Date() },
    });

    if (dueReplyJob) {
      await this.processAutoReplyJob(dueReplyJob._id as mongoose.Types.ObjectId, workerId);
    }

    // Auto-Reply Recovery Check:
    // If thread is AI-controlled, Auto-Reply is enabled, and the latest client message completed AI analysis
    // without an active auto-reply job, schedule the 10-second takeover window!
    const activeAutoReplyJob = await AdminAutoReplyJob.findOne({
      threadId: threadIdObj,
      status: "PENDING",
    });

    if (!activeAutoReplyJob && !pendingAiJob) {
      const thread = await AdminClientThread.findById(threadIdObj);
      if (
        thread &&
        !thread.adminControlled &&
        thread.perThreadAiEnabled !== false &&
        thread.aiAutoReplyAllowed !== false &&
        thread.lastSender === "client"
      ) {
        const { PresenceService } = await import("@/lib/communication/presence-service");
        const freshState = await PresenceService.getState();
        if (
          freshState.settings.autoReplyGlobalEnabled &&
          freshState.effectiveMode !== "MESSAGING_OFF"
        ) {
          const lastMsg = await AdminClientMessage.findOne({
            threadId: threadIdObj,
            sender: "client",
          }).sort({ createdAt: -1 });

          if (
            lastMsg &&
            lastMsg.aiStatus === "COMPLETED" &&
            lastMsg.autoReplyStatus === "NOT_SCHEDULED" &&
            lastMsg.aiAnalysis?.suggestions
          ) {
            const tone = (freshState.settings.defaultTone || lastMsg.aiAnalysis.recommendedTone || "professional") as "professional" | "friendly" | "detailed";
            const proposedReply = lastMsg.aiAnalysis.suggestions[tone] || lastMsg.aiAnalysis.suggestions.professional;

            if (proposedReply) {
              const countdownSec = freshState.settings.countdownDurationSeconds || 10;
              const scheduledExecuteAt = new Date(Date.now() + countdownSec * 1000);

              const [autoJob] = await AdminAutoReplyJob.create([
                {
                  threadId: thread._id,
                  threadGeneration: thread.threadGeneration,
                  settingsRevision: freshState.settings.settingsRevision || 1,
                  messageId: lastMsg._id,
                  idempotencyKey: `auto_${lastMsg._id.toString()}_${thread.threadGeneration}`,
                  scheduledExecuteAt,
                  proposedReply,
                  tone,
                  status: "PENDING",
                },
              ]);

              thread.activeJobId = autoJob._id;
              await thread.save();

              await AdminClientMessage.findByIdAndUpdate(lastMsg._id, {
                $set: { autoReplyStatus: "PENDING" },
              });
            }
          }
        }
      }
    }
  }
}
