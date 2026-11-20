import dbConnect, { isMongoConnected, DatabaseConnectionError, getLastDatabaseError } from "@/lib/db/connect";
import User, { IUser } from "@/models/User";
import Campaign, { ICampaign } from "@/models/Campaign";
import Conversation, { IConversation } from "@/models/Conversation";
import Message, { IMessage } from "@/models/Message";
import Artifact1, { IArtifact1 } from "@/models/Artifact1";
import Artifact2, { IArtifact2 } from "@/models/Artifact2";
import MasterCampaignBrief, { IMasterCampaignBrief } from "@/models/MasterCampaignBrief";

function assertMemoryFallbackAllowed(operation: string) {
  if (process.env.ALLOW_MEMORY_FALLBACK === "false") {
    const lastErr = getLastDatabaseError();
    const reasonMsg = lastErr?.message ? ` (Underlying cause: ${lastErr.message})` : "";
    throw new DatabaseConnectionError(
      `[Repository] Database unavailable for ${operation} and ALLOW_MEMORY_FALLBACK is 'false'.${reasonMsg}`
    );
  }
}

// In-Memory Storage for Demo Fallback Mode
interface LocalStore {
  users: Record<string, any>;
  campaigns: Record<string, any>;
  conversations: Record<string, any>;
  messages: any[];
  artifacts1: Record<string, any>;
  artifacts2: Record<string, any>;
  masterBriefs: Record<string, any>;
}

declare global {
  // eslint-disable-next-line no-var
  var demoStore: LocalStore | undefined;
}

const memoryStore: LocalStore = global.demoStore || {
  users: {},
  campaigns: {},
  conversations: {},
  messages: [],
  artifacts1: {},
  artifacts2: {},
  masterBriefs: {},
};

if (!global.demoStore) {
  global.demoStore = memoryStore;
}

function generateId(prefix = "id"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

export const Repository = {
  async getStorageMode(): Promise<"mongodb" | "demo_fallback"> {
    await dbConnect();
    return isMongoConnected() ? "mongodb" : "demo_fallback";
  },

  // USERS
  async getOrCreateDemoClient() {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      let client = await User.findOne({ role: "client" });
      if (!client) {
        client = await User.create({
          name: "Demo Client",
          email: "client@example.com",
          role: "client",
        });
      }
      return client;
    }

    assertMemoryFallbackAllowed("getOrCreateDemoClient");

    // Fallback
    const existing = Object.values(memoryStore.users).find((u) => u.role === "client");
    if (existing) return existing;
    const newClient = {
      _id: generateId("usr"),
      name: "Demo Client",
      email: "client@example.com",
      role: "client",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryStore.users[newClient._id] = newClient;
    return newClient;
  },

  async findUserByEmail(email: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await User.findOne({ email });
    }
    assertMemoryFallbackAllowed("findUserByEmail");
    return Object.values(memoryStore.users).find((u) => u.email === email) || null;
  },

  async createUser(data: { name: string; email: string; password?: string; role: "admin" | "client" }) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await User.create(data);
    }
    assertMemoryFallbackAllowed("createUser");
    const newUser = {
      _id: generateId("usr"),
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryStore.users[newUser._id] = newUser;
    return newUser;
  },

  // CAMPAIGNS
  async createCampaign(name: string, clientId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      const campaign = await Campaign.create({
        clientId,
        name: name || "Untitled Campaign",
        status: "collecting",
      });

      const conversation = await Conversation.create({
        campaignId: campaign._id,
        status: "active",
      });

      campaign.conversationId = conversation._id;
      await campaign.save();

      return {
        campaignId: campaign._id.toString(),
        conversationId: conversation._id.toString(),
        campaign,
      };
    }

    assertMemoryFallbackAllowed("createCampaign");

    // Fallback store
    const campaignId = generateId("camp");
    const conversationId = generateId("conv");

    const campaign = {
      _id: campaignId,
      clientId,
      name: name || "Untitled Campaign",
      status: "collecting",
      conversationId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const conversation = {
      _id: conversationId,
      campaignId,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    memoryStore.campaigns[campaignId] = campaign;
    memoryStore.conversations[conversationId] = conversation;

    return { campaignId, conversationId, campaign };
  },

  async getCampaignById(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Campaign.findById(campaignId).populate("clientId");
    }
    assertMemoryFallbackAllowed("getCampaignById");
    const c = memoryStore.campaigns[campaignId];
    if (!c) return null;
    const client = memoryStore.users[c.clientId] || { name: "Demo Client", email: "client@example.com" };
    return { ...c, clientId: client };
  },

  async getAllCampaigns() {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Campaign.find().populate("clientId", "name email").sort({ createdAt: -1 });
    }
    assertMemoryFallbackAllowed("getAllCampaigns");
    const list = Object.values(memoryStore.campaigns).map((c) => {
      const client = memoryStore.users[c.clientId] || { name: "Demo Client", email: "client@example.com" };
      return { ...c, clientId: client };
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async updateCampaignStatus(campaignId: string, status: string, additionalRefs: Record<string, any> = {}) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Campaign.findByIdAndUpdate(campaignId, { status, ...additionalRefs }, { returnDocument: 'after' });
    }
    assertMemoryFallbackAllowed("updateCampaignStatus");
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].status = status;
      Object.assign(memoryStore.campaigns[campaignId], additionalRefs);
      memoryStore.campaigns[campaignId].updatedAt = new Date();
      return memoryStore.campaigns[campaignId];
    }
    return null;
  },

  /**
   * Updates the campaign name to reflect the confirmed brand name.
   * Called automatically as soon as the brand name is extracted from the conversation.
   */
  async updateCampaignName(campaignId: string, brandName: string) {
    if (!brandName || brandName.trim().length < 2) return null;
    const cleanName = brandName.trim();
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Campaign.findByIdAndUpdate(
        campaignId,
        { name: cleanName },
        { returnDocument: 'after' }
      );
    }
    assertMemoryFallbackAllowed("updateCampaignName");
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].name = cleanName;
      memoryStore.campaigns[campaignId].updatedAt = new Date();
      return memoryStore.campaigns[campaignId];
    }
    return null;
  },

  // CONVERSATIONS & MESSAGES
  async getConversation(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Conversation.findOne({ campaignId });
    }
    assertMemoryFallbackAllowed("getConversation");
    return Object.values(memoryStore.conversations).find((cv) => cv.campaignId === campaignId) || null;
  },

  async getMessages(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Message.find({ campaignId }).sort({ createdAt: 1 });
    }
    assertMemoryFallbackAllowed("getMessages");
    return memoryStore.messages
      .filter((m) => m.campaignId === campaignId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },

  async createMessage(data: {
    conversationId: string;
    campaignId: string;
    sender: "user" | "ai" | "system";
    content: string;
    extractedFields?: any;
  }) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Message.create(data);
    }
    assertMemoryFallbackAllowed("createMessage");
    const msg = {
      _id: generateId("msg"),
      ...data,
      createdAt: new Date(),
    };
    memoryStore.messages.push(msg);
    return msg;
  },

  // ARTIFACT 1
  async getArtifact1(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Artifact1.findOne({ campaignId });
    }
    assertMemoryFallbackAllowed("getArtifact1");
    return memoryStore.artifacts1[campaignId] || null;
  },

  async upsertArtifact1(campaignId: string, updates: any = {}, status: "draft" | "confirmed" = "draft") {
    // Sanitize numeric fields if LLM passed range strings
    if (updates.budget && typeof updates.budget.amount === "string") {
      const numbers = (updates.budget.amount as string).match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const val = Number(numbers[numbers.length - 1]);
        updates.budget.amount = isNaN(val) ? null : val;
        if (numbers.length > 1) updates.budget.type = "range";
      } else {
        updates.budget.amount = null;
      }
    }
    if (updates.product_service && typeof updates.product_service.price === "string") {
      const numbers = (updates.product_service.price as string).match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const val = Number(numbers[0]);
        updates.product_service.price = isNaN(val) ? null : val;
      } else {
        updates.product_service.price = null;
      }
    }

    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      let artifact = await Artifact1.findOne({ campaignId });
      if (!artifact) {
        artifact = new Artifact1({ campaignId, type: "client_facts", status });
      }

      if (updates.client) artifact.client = { ...artifact.client?.toObject?.() || artifact.client, ...updates.client };
      if (updates.product_service) artifact.product_service = { ...artifact.product_service?.toObject?.() || artifact.product_service, ...updates.product_service };
      if (updates.campaign) artifact.campaign = { ...artifact.campaign?.toObject?.() || artifact.campaign, ...updates.campaign };
      if (updates.target_audience) artifact.target_audience = { ...artifact.target_audience?.toObject?.() || artifact.target_audience, ...updates.target_audience };
      if (updates.budget) artifact.budget = { ...artifact.budget?.toObject?.() || artifact.budget, ...updates.budget };
      if (updates.timeline) artifact.timeline = { ...artifact.timeline?.toObject?.() || artifact.timeline, ...updates.timeline };
      if (updates.brand_preferences) artifact.brand_preferences = { ...artifact.brand_preferences?.toObject?.() || artifact.brand_preferences, ...updates.brand_preferences };
      if (updates.assets) artifact.assets = { ...artifact.assets?.toObject?.() || artifact.assets, ...updates.assets };
      if (updates.offers) (artifact as any).offers = { ...(artifact as any).offers?.toObject?.() || (artifact as any).offers, ...updates.offers };
      if (updates.operations) (artifact as any).operations = { ...(artifact as any).operations?.toObject?.() || (artifact as any).operations, ...updates.operations };
      if (updates.confirmed_facts) (artifact as any).confirmed_facts = { ...(artifact as any).confirmed_facts || {}, ...updates.confirmed_facts };
      if (updates.ai_recommendations) (artifact as any).ai_recommendations = { ...(artifact as any).ai_recommendations || {}, ...updates.ai_recommendations };
      if (updates.assumptions) (artifact as any).assumptions = { ...(artifact as any).assumptions || {}, ...updates.assumptions };
      if (updates.missing_information) (artifact as any).missing_information = updates.missing_information;

      if (status) artifact.status = status;
      await artifact.save();

      // Ensure campaign references artifact1 AND auto-syncs name with confirmed brand name
      const campaignUpdates: any = { artifact1Id: artifact._id };
      const brandName = artifact.client?.company_name;
      if (brandName && typeof brandName === "string" && brandName.trim().length >= 2 && brandName.toLowerCase() !== "name") {
        const camp = await Campaign.findById(campaignId);
        if (camp) {
          const isDefault = !camp.name || camp.name === "New Marketing Campaign" || camp.name === "Untitled Campaign";
          if (isDefault) {
            campaignUpdates.name = brandName.trim();
          }
        }
      }
      await Campaign.findByIdAndUpdate(campaignId, campaignUpdates);
      return artifact;
    }

    assertMemoryFallbackAllowed("upsertArtifact1");

    // Fallback store
    let current = memoryStore.artifacts1[campaignId];
    if (!current) {
      current = {
        _id: generateId("art1"),
        campaignId,
        type: "client_facts",
        status: "draft",
        client: { name: "", company_name: "", industry: "", website: "", business_description: "" },
        product_service: { name: "", type: "", description: "", price: null, offer: "" },
        campaign: { name: "", objective: "", campaign_type: "", desired_result: "" },
        target_audience: { age_range: "", gender: "", location: "", description: "" },
        budget: { amount: null, currency: "BDT", type: "unspecified" },
        timeline: { start_date: "", end_date: "", duration: "" },
        brand_preferences: { tone: [], language: [], visual_preference: "", do: [], dont: [] },
        assets: { logo: [], images: [], videos: [], documents: [], links: [] },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    if (updates.client) current.client = { ...current.client, ...updates.client };
    if (updates.product_service) current.product_service = { ...current.product_service, ...updates.product_service };
    if (updates.campaign) current.campaign = { ...current.campaign, ...updates.campaign };
    if (updates.target_audience) current.target_audience = { ...current.target_audience, ...updates.target_audience };
    if (updates.budget) current.budget = { ...current.budget, ...updates.budget };
    if (updates.timeline) current.timeline = { ...current.timeline, ...updates.timeline };
    if (updates.brand_preferences) current.brand_preferences = { ...current.brand_preferences, ...updates.brand_preferences };
    if (updates.assets) current.assets = { ...current.assets, ...updates.assets };
    if (updates.offers) current.offers = { ...(current.offers || {}), ...updates.offers };
    if (updates.operations) current.operations = { ...(current.operations || {}), ...updates.operations };
    if (updates.confirmed_facts) current.confirmed_facts = { ...(current.confirmed_facts || {}), ...updates.confirmed_facts };
    if (updates.ai_recommendations) current.ai_recommendations = { ...(current.ai_recommendations || {}), ...updates.ai_recommendations };
    if (updates.assumptions) current.assumptions = { ...(current.assumptions || {}), ...updates.assumptions };
    if (updates.missing_information) current.missing_information = updates.missing_information;

    if (status) current.status = status;
    current.updatedAt = new Date();

    memoryStore.artifacts1[campaignId] = current;
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].artifact1Id = current._id;
      const brandName = current.client?.company_name;
      if (brandName && brandName.trim().length >= 2 && brandName.toLowerCase() !== "name") {
        const campName = memoryStore.campaigns[campaignId].name;
        if (!campName || campName === "New Marketing Campaign" || campName === "Untitled Campaign") {
          memoryStore.campaigns[campaignId].name = brandName.trim();
        }
      }
    }
    return current;
  },

  // CAMPAIGN DOCUMENTS (Phase 1 Deliverables)
  async saveCampaignDocuments(campaignId: string, docs: { masterBriefMarkdown: string; executionScriptMarkdown: string }) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      let brief = await MasterCampaignBrief.findOne({ campaignId });
      if (brief) {
        brief.masterBriefMarkdown = docs.masterBriefMarkdown;
        brief.executionScriptMarkdown = docs.executionScriptMarkdown;
        brief.status = "confirmed";
        brief.version = "1.0";
        await brief.save();
      } else {
        brief = await MasterCampaignBrief.create({
          campaignId,
          status: "confirmed",
          version: "1.0",
          masterBriefMarkdown: docs.masterBriefMarkdown,
          executionScriptMarkdown: docs.executionScriptMarkdown,
        });
      }

      const campaignDocUpdates: any = {
        masterBriefId: brief._id,
        masterBriefMarkdown: docs.masterBriefMarkdown,
        executionScriptMarkdown: docs.executionScriptMarkdown,
        status: "completed",
      };

      // Ensure campaign name reflects confirmed brand
      const briefTitleMatch = docs.masterBriefMarkdown?.match(/^#\s+MASTER\s+CAMPAIGN\s+BRIEF:\s*(.+)$/m);
      const brandInBrief = briefTitleMatch?.[1]?.replace(/[*_#]/g, "")?.trim();
      if (brandInBrief && brandInBrief.length >= 2 && brandInBrief.toLowerCase() !== "name") {
        campaignDocUpdates.name = brandInBrief;
      } else {
        const art1 = await Artifact1.findOne({ campaignId });
        if (art1?.client?.company_name && art1.client.company_name.toLowerCase() !== "name") {
          campaignDocUpdates.name = art1.client.company_name.trim();
        }
      }

      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        campaignDocUpdates,
        { returnDocument: 'after' }
      );
      return campaign;
    }

    assertMemoryFallbackAllowed("saveCampaignDocuments");

    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].masterBriefMarkdown = docs.masterBriefMarkdown;
      memoryStore.campaigns[campaignId].executionScriptMarkdown = docs.executionScriptMarkdown;
      memoryStore.campaigns[campaignId].status = "completed";
      memoryStore.campaigns[campaignId].updatedAt = new Date();
      const briefTitleMatch = docs.masterBriefMarkdown?.match(/^#\s+MASTER\s+CAMPAIGN\s+BRIEF:\s*(.+)$/m);
      const brandInBrief = briefTitleMatch?.[1]?.replace(/[*_#]/g, "")?.trim();
      if (brandInBrief && brandInBrief.length >= 2 && brandInBrief.toLowerCase() !== "name") {
        memoryStore.campaigns[campaignId].name = brandInBrief;
      }
      return memoryStore.campaigns[campaignId];
    }
    return null;
  },

  async getCampaignDocuments(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) return null;
      return {
        masterBriefMarkdown: campaign.masterBriefMarkdown || "",
        executionScriptMarkdown: campaign.executionScriptMarkdown || "",
        status: campaign.status,
      };
    }

    assertMemoryFallbackAllowed("getCampaignDocuments");

    const campaign = memoryStore.campaigns[campaignId];
    if (!campaign) return null;
    return {
      masterBriefMarkdown: campaign.masterBriefMarkdown || "",
      executionScriptMarkdown: campaign.executionScriptMarkdown || "",
      status: campaign.status,
    };
  },

  async confirmArtifact1(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      const artifact = await Artifact1.findOneAndUpdate(
        { campaignId },
        { status: "confirmed" },
        { returnDocument: 'after' }
      );
      const campUpdate: any = { status: "confirmed" };
      const brandName = artifact?.client?.company_name;
      if (brandName && typeof brandName === "string" && brandName.trim().length >= 2 && brandName.toLowerCase() !== "name") {
        campUpdate.name = brandName.trim();
      }
      await Campaign.findByIdAndUpdate(campaignId, campUpdate);
      return artifact;
    }

    assertMemoryFallbackAllowed("confirmArtifact1");

    if (memoryStore.artifacts1[campaignId]) {
      memoryStore.artifacts1[campaignId].status = "confirmed";
      memoryStore.artifacts1[campaignId].updatedAt = new Date();
    }
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].status = "confirmed";
      const brandName = memoryStore.artifacts1[campaignId]?.client?.company_name;
      if (brandName && brandName.trim().length >= 2 && brandName.toLowerCase() !== "name") {
        memoryStore.campaigns[campaignId].name = brandName.trim();
      }
    }
    return memoryStore.artifacts1[campaignId] || null;
  },

  // ARTIFACT 2
  async getArtifact2(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Artifact2.findOne({ campaignId });
    }
    assertMemoryFallbackAllowed("getArtifact2");
    return memoryStore.artifacts2[campaignId] || null;
  },

  async saveArtifact2(campaignId: string, data: any) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      let artifact2 = await Artifact2.findOne({ campaignId });
      if (artifact2) {
        const existingSnapshot = {
          version: artifact2.version || "1.0",
          research_status: artifact2.research_status,
          completion_date: artifact2.completion_date,
          categories_completed: artifact2.categories_completed,
          findings: artifact2.findings,
          competitors: artifact2.competitors,
          sources: artifact2.sources,
          stats: artifact2.stats,
          limitations: artifact2.limitations,
          search_provider_status: artifact2.search_provider_status,
          savedAt: new Date(),
        };

        const currentRevHistory = Array.isArray(artifact2.revision_history) ? [...artifact2.revision_history] : [];
        currentRevHistory.push(existingSnapshot);

        const currentVersionNumber = parseFloat(artifact2.version || "1.0");
        const nextVersion = isNaN(currentVersionNumber) ? "2.0" : (currentVersionNumber + 1.0).toFixed(1);

        Object.assign(artifact2, data, {
          status: "confirmed",
          version: nextVersion,
          revision_history: currentRevHistory,
        });
        await artifact2.save();
      } else {
        artifact2 = await Artifact2.create({
          campaignId,
          status: "confirmed",
          version: data.version || "1.0",
          revision_history: [],
          ...data,
        });
      }
      await Campaign.findByIdAndUpdate(campaignId, { artifact2Id: artifact2._id });
      return artifact2;
    }

    assertMemoryFallbackAllowed("saveArtifact2");

    const prev = memoryStore.artifacts2[campaignId];
    let revision_history: any[] = [];
    let nextVersion = "1.0";
    if (prev) {
      revision_history = Array.isArray(prev.revision_history) ? [...prev.revision_history] : [];
      revision_history.push({
        version: prev.version || "1.0",
        research_status: prev.research_status,
        findings: prev.findings,
        competitors: prev.competitors,
        sources: prev.sources,
        stats: prev.stats,
        savedAt: new Date(),
      });
      const verNum = parseFloat(prev.version || "1.0");
      nextVersion = isNaN(verNum) ? "2.0" : (verNum + 1.0).toFixed(1);
    }

    const art2 = {
      _id: prev?._id || generateId("art2"),
      campaignId,
      type: "research_enrichment",
      status: "confirmed",
      ...data,
      version: prev ? nextVersion : (data.version || "1.0"),
      revision_history,
      createdAt: prev?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    memoryStore.artifacts2[campaignId] = art2;
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].artifact2Id = art2._id;
    }
    return art2;
  },

  // MASTER CAMPAIGN BRIEF
  async getMasterBrief(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await MasterCampaignBrief.findOne({ campaignId });
    }
    assertMemoryFallbackAllowed("getMasterBrief");
    return memoryStore.masterBriefs[campaignId] || null;
  },

  async saveMasterBrief(campaignId: string, data: any) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      let brief = await MasterCampaignBrief.findOne({ campaignId });
      if (brief) {
        Object.assign(brief, data, { status: "confirmed", version: "1.0" });
        await brief.save();
      } else {
        brief = await MasterCampaignBrief.create({
          campaignId,
          status: "confirmed",
          version: "1.0",
          ...data,
        });
      }
      const masterBriefCampaignUpdates: any = {
        masterBriefId: brief._id,
        status: "completed",
      };

      const briefTitleMatch = data?.masterBriefMarkdown?.match(/^#\s+MASTER\s+CAMPAIGN\s+BRIEF:\s*(.+)$/m);
      const brandInBrief = briefTitleMatch?.[1]?.replace(/[*_#]/g, "")?.trim();
      if (brandInBrief && brandInBrief.length >= 2 && brandInBrief.toLowerCase() !== "name") {
        masterBriefCampaignUpdates.name = brandInBrief;
      }

      await Campaign.findByIdAndUpdate(campaignId, masterBriefCampaignUpdates);
      return brief;
    }

    assertMemoryFallbackAllowed("saveMasterBrief");

    const brief = {
      _id: generateId("brief"),
      campaignId,
      status: "confirmed",
      version: "1.0",
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryStore.masterBriefs[campaignId] = brief;
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].masterBriefId = brief._id;
      memoryStore.campaigns[campaignId].status = "completed";
      const briefTitleMatch = data?.masterBriefMarkdown?.match(/^#\s+MASTER\s+CAMPAIGN\s+BRIEF:\s*(.+)$/m);
      const brandInBrief = briefTitleMatch?.[1]?.replace(/[*_#]/g, "")?.trim();
      if (brandInBrief && brandInBrief.length >= 2 && brandInBrief.toLowerCase() !== "name") {
        memoryStore.campaigns[campaignId].name = brandInBrief;
      }
    }
    return brief;
  },

  // ADMIN OVERVIEW METRICS
  async getAdminStats() {
    const allCampaigns = await this.getAllCampaigns();
    const totalCampaigns = allCampaigns.length;
    const completedBriefs = allCampaigns.filter((c) => c.status === "completed").length;
    const activeConversations = allCampaigns.filter((c) => c.status === "collecting" || c.status === "ready_for_confirmation").length;
    const completedResearch = allCampaigns.filter((c) => c.status === "research_completed" || c.status === "completed").length;

    const mongo = await dbConnect();
    let totalClients = 0;
    if (mongo && isMongoConnected()) {
      totalClients = await User.countDocuments({ role: "client" });
    } else {
      assertMemoryFallbackAllowed("getAdminStats");
      totalClients = Object.values(memoryStore.users).filter((u) => u.role === "client").length || 1;
    }

    return {
      totalClients,
      totalCampaigns,
      activeConversations,
      completedResearch,
      completedBriefs,
    };
  },
};
