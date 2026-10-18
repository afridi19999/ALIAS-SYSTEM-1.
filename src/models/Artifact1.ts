import mongoose, { Schema, Document } from "mongoose";

export interface IArtifact1 extends Document {
  campaignId: mongoose.Types.ObjectId;
  type: string;
  status: "draft" | "confirmed";
  client: {
    name: string;
    company_name: string;
    industry: string;
    website: string;
    business_description: string;
  };
  product_service: {
    name: string;
    type: string;
    description: string;
    price: number | null;
    offer: string;
  };
  campaign: {
    name: string;
    objective: string;
    campaign_type: string;
    desired_result: string;
  };
  target_audience: {
    age_range: string;
    gender: string;
    location: string;
    description: string;
  };
  budget: {
    amount: number | null;
    currency: string;
    type: "exact" | "approximate" | "range" | "unknown" | "unspecified";
  };
  timeline: {
    start_date: string;
    end_date: string;
    duration: string;
  };
  brand_preferences: {
    tone: string[];
    language: string[];
    visual_preference: string;
    do: string[];
    dont: string[];
  };
  assets: {
    logo: string[];
    images: string[];
    videos: string[];
    documents: string[];
    links: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

const Artifact1Schema = new Schema(
  {
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    type: { type: String, default: "client_facts" },
    status: { type: String, enum: ["draft", "confirmed"], default: "draft" },
    client: {
      name: { type: String, default: "" },
      company_name: { type: String, default: "" },
      industry: { type: String, default: "" },
      website: { type: String, default: "" },
      business_description: { type: String, default: "" },
    },
    product_service: {
      name: { type: String, default: "" },
      type: { type: String, default: "" },
      description: { type: String, default: "" },
      price: { type: Number, default: null },
      offer: { type: String, default: "" },
    },
    campaign: {
      name: { type: String, default: "" },
      objective: { type: String, default: "" },
      campaign_type: { type: String, default: "" },
      desired_result: { type: String, default: "" },
    },
    target_audience: {
      age_range: { type: String, default: "" },
      gender: { type: String, default: "" },
      location: { type: String, default: "" },
      description: { type: String, default: "" },
    },
    budget: {
      amount: { type: Number, default: null },
      currency: { type: String, default: "BDT" },
      type: { type: String, enum: ["exact", "approximate", "range", "unknown", "unspecified"], default: "unspecified" },
    },
    timeline: {
      start_date: { type: String, default: "" },
      end_date: { type: String, default: "" },
      duration: { type: String, default: "" },
    },
    brand_preferences: {
      tone: [{ type: String }],
      language: [{ type: String }],
      visual_preference: { type: String, default: "" },
      do: [{ type: String }],
      dont: [{ type: String }],
    },
    assets: {
      logo: [{ type: String }],
      images: [{ type: String }],
      videos: [{ type: String }],
      documents: [{ type: String }],
      links: [{ type: String }],
    },
  },
  { timestamps: true }
);

export default mongoose.models.Artifact1 || mongoose.model<IArtifact1>("Artifact1", Artifact1Schema);
