import mongoose, { Schema, Document } from "mongoose";

export interface IArtifact2 extends Document {
  campaignId: mongoose.Types.ObjectId;
  type: string;
  status: "draft" | "confirmed";
  market_research: {
    overview: string;
    market_size: string;
    growth: string;
    trends: string[];
    opportunities: string[];
    risks: string[];
  };
  competitor_research: any[];
  audience_research: {
    demographics: string[];
    interests: string[];
    behaviors: string[];
    pain_points: string[];
    motivations: string[];
    buying_patterns: string[];
    platform_usage: string[];
  };
  platform_research: any[];
  pricing_research: {
    market_price_range: string;
    competitor_prices: any[];
    common_offers: string[];
    discount_patterns: string[];
  };
  trends_and_opportunities: {
    content_trends: string[];
    consumer_trends: string[];
    seasonal_trends: string[];
    opportunities: string[];
  };
  sources: any[];
  createdAt: Date;
  updatedAt: Date;
}

const Artifact2Schema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    type: { type: String, default: "research_enrichment" },
    status: { type: String, enum: ["draft", "confirmed"], default: "draft" },
    market_research: {
      overview: { type: String, default: "" },
      market_size: { type: String, default: "" },
      growth: { type: String, default: "" },
      trends: [{ type: String }],
      opportunities: [{ type: String }],
      risks: [{ type: String }],
    },
    competitor_research: [{ type: Schema.Types.Mixed }],
    audience_research: {
      demographics: [{ type: String }],
      interests: [{ type: String }],
      behaviors: [{ type: String }],
      pain_points: [{ type: String }],
      motivations: [{ type: String }],
      buying_patterns: [{ type: String }],
      platform_usage: [{ type: String }],
    },
    platform_research: [{ type: Schema.Types.Mixed }],
    pricing_research: {
      market_price_range: { type: String, default: "" },
      competitor_prices: [{ type: Schema.Types.Mixed }],
      common_offers: [{ type: String }],
      discount_patterns: [{ type: String }],
    },
    trends_and_opportunities: {
      content_trends: [{ type: String }],
      consumer_trends: [{ type: String }],
      seasonal_trends: [{ type: String }],
      opportunities: [{ type: String }],
    },
    sources: [{ type: Schema.Types.Mixed }],
  },
  { timestamps: true }
);

export default mongoose.models.Artifact2 || mongoose.model<IArtifact2>("Artifact2", Artifact2Schema);
