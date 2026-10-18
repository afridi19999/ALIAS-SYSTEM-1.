import dbConnect, { isMongoConnected } from "@/lib/db/connect";
import User, { IUser } from "@/models/User";
import Campaign, { ICampaign } from "@/models/Campaign";
import Conversation, { IConversation } from "@/models/Conversation";
import Message, { IMessage } from "@/models/Message";
import Artifact1, { IArtifact1 } from "@/models/Artifact1";
import Artifact2, { IArtifact2 } from "@/models/Artifact2";
import MasterCampaignBrief, { IMasterCampaignBrief } from "@/models/MasterCampaignBrief";

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
    return Object.values(memoryStore.users).find((u) => u.email === email) || null;
  },

  async createUser(data: { name: string; email: string; password?: string; role: "admin" | "client" }) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await User.create(data);
    }
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
    const list = Object.values(memoryStore.campaigns).map((c) => {
      const client = memoryStore.users[c.clientId] || { name: "Demo Client", email: "client@example.com" };
      return { ...c, clientId: client };
    });
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  },

  async updateCampaignStatus(campaignId: string, status: string, additionalRefs: Record<string, any> = {}) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Campaign.findByIdAndUpdate(campaignId, { status, ...additionalRefs }, { new: true });
    }
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].status = status;
      Object.assign(memoryStore.campaigns[campaignId], additionalRefs);
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
    return Object.values(memoryStore.conversations).find((cv) => cv.campaignId === campaignId) || null;
  },

  async getMessages(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Message.find({ campaignId }).sort({ createdAt: 1 });
    }
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
    return memoryStore.artifacts1[campaignId] || null;
  },

  async upsertArtifact1(campaignId: string, updates: any = {}, status: "draft" | "confirmed" = "draft") {
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

      if (status) artifact.status = status;
      await artifact.save();

      // Ensure campaign references artifact1
      await Campaign.findByIdAndUpdate(campaignId, { artifact1Id: artifact._id });
      return artifact;
    }

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

    if (status) current.status = status;
    current.updatedAt = new Date();

    memoryStore.artifacts1[campaignId] = current;
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].artifact1Id = current._id;
    }
    return current;
  },

  async confirmArtifact1(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      const artifact = await Artifact1.findOneAndUpdate(
        { campaignId },
        { status: "confirmed" },
        { new: true }
      );
      await Campaign.findByIdAndUpdate(campaignId, { status: "confirmed" });
      return artifact;
    }

    if (memoryStore.artifacts1[campaignId]) {
      memoryStore.artifacts1[campaignId].status = "confirmed";
      memoryStore.artifacts1[campaignId].updatedAt = new Date();
    }
    if (memoryStore.campaigns[campaignId]) {
      memoryStore.campaigns[campaignId].status = "confirmed";
    }
    return memoryStore.artifacts1[campaignId] || null;
  },

  // ARTIFACT 2
  async getArtifact2(campaignId: string) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      return await Artifact2.findOne({ campaignId });
    }
    return memoryStore.artifacts2[campaignId] || null;
  },

  async saveArtifact2(campaignId: string, data: any) {
    const mongo = await dbConnect();
    if (mongo && isMongoConnected()) {
      let artifact2 = await Artifact2.findOne({ campaignId });
      if (artifact2) {
        Object.assign(artifact2, data, { status: "confirmed" });
        await artifact2.save();
      } else {
        artifact2 = await Artifact2.create({
          campaignId,
          status: "confirmed",
          ...data,
        });
      }
      await Campaign.findByIdAndUpdate(campaignId, { artifact2Id: artifact2._id });
      return artifact2;
    }

    const art2 = {
      _id: generateId("art2"),
      campaignId,
      type: "research_enrichment",
      status: "confirmed",
      ...data,
      createdAt: new Date(),
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
      await Campaign.findByIdAndUpdate(campaignId, {
        masterBriefId: brief._id,
        status: "completed",
      });
      return brief;
    }

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
