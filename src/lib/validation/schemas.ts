import { z } from "zod";

// ARTIFACT 1: CLIENT FACTS SCHEMA (Section 7)
export const Artifact1Schema = z.object({
  artifact_id: z.string().default("artifact_1"),
  type: z.literal("client_facts").default("client_facts"),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  client: z.object({
    name: z.string().default(""),
    company_name: z.string().default(""),
    industry: z.string().default(""),
    website: z.string().default(""),
    business_description: z.string().default(""),
  }),
  product_service: z.object({
    name: z.string().default(""),
    type: z.string().default(""),
    description: z.string().default(""),
    price: z.number().nullable().default(null),
    offer: z.string().default(""),
  }),
  campaign: z.object({
    name: z.string().default(""),
    objective: z.string().default(""),
    campaign_type: z.string().default(""),
    desired_result: z.string().default(""),
  }),
  target_audience: z.object({
    age_range: z.string().default(""),
    gender: z.string().default(""),
    location: z.string().default(""),
    description: z.string().default(""),
  }),
  budget: z.object({
    amount: z.number().nullable().default(null),
    currency: z.string().default("BDT"),
    type: z.enum(["exact", "approximate", "range", "unknown", "unspecified"]).default("unspecified"),
  }),
  timeline: z.object({
    start_date: z.string().default(""),
    end_date: z.string().default(""),
    duration: z.string().default(""),
  }),
  brand_preferences: z.object({
    tone: z.array(z.string()).default([]),
    language: z.array(z.string()).default([]),
    visual_preference: z.string().default(""),
    do: z.array(z.string()).default([]),
    dont: z.array(z.string()).default([]),
  }),
  assets: z.object({
    logo: z.array(z.string()).default([]),
    images: z.array(z.string()).default([]),
    videos: z.array(z.string()).default([]),
    documents: z.array(z.string()).default([]),
    links: z.array(z.string()).default([]),
  }),
});

// ARTIFACT 2: RESEARCH ENRICHMENT SCHEMA (Section 10)
export const Artifact2Schema = z.object({
  artifact_id: z.string().default("artifact_2"),
  type: z.literal("research_enrichment").default("research_enrichment"),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  market_research: z.object({
    overview: z.string().default(""),
    market_size: z.string().default(""),
    growth: z.string().default(""),
    trends: z.array(z.string()).default([]),
    opportunities: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
  }),
  competitor_research: z.array(
    z.object({
      name: z.string(),
      website: z.string().optional().default(""),
      products: z.string().optional().default(""),
      price_range: z.string().optional().default(""),
      positioning: z.string().optional().default(""),
      offers: z.string().optional().default(""),
      social_presence: z.string().optional().default(""),
      content_strategy: z.string().optional().default(""),
    })
  ).default([]),
  audience_research: z.object({
    demographics: z.array(z.string()).default([]),
    interests: z.array(z.string()).default([]),
    behaviors: z.array(z.string()).default([]),
    pain_points: z.array(z.string()).default([]),
    motivations: z.array(z.string()).default([]),
    buying_patterns: z.array(z.string()).default([]),
    platform_usage: z.array(z.string()).default([]),
  }),
  platform_research: z.array(
    z.object({
      platform: z.string(),
      suitability_score: z.string().optional().default("High"),
      recommended_content: z.string().optional().default(""),
      formats: z.array(z.string()).optional().default([]),
      best_practices: z.array(z.string()).optional().default([]),
    })
  ).default([]),
  pricing_research: z.object({
    market_price_range: z.string().default(""),
    competitor_prices: z.array(z.any()).default([]),
    common_offers: z.array(z.string()).default([]),
    discount_patterns: z.array(z.string()).default([]),
  }),
  trends_and_opportunities: z.object({
    content_trends: z.array(z.string()).default([]),
    consumer_trends: z.array(z.string()).default([]),
    seasonal_trends: z.array(z.string()).default([]),
    opportunities: z.array(z.string()).default([]),
  }),
  sources: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      source_type: z.string().default("Market Analysis"),
      research_date: z.string(),
    })
  ).default([]),
});

// MASTER CAMPAIGN BRIEF SCHEMA (Section 12)
export const MasterCampaignBriefSchema = z.object({
  brief_id: z.string().default("brief_1"),
  status: z.enum(["draft", "confirmed"]).default("draft"),
  version: z.string().default("1.0"),
  campaign_summary: z.object({
    campaign_name: z.string().default(""),
    business: z.string().default(""),
    product_service: z.string().default(""),
    objective: z.string().default(""),
    desired_result: z.string().default(""),
  }),
  target_audience: z.object({
    client_stated: z.record(z.string(), z.any()).default({}),
    research_insights: z.record(z.string(), z.any()).default({}),
  }),
  market_insights: z.object({
    key_findings: z.array(z.string()).default([]),
    trends: z.array(z.string()).default([]),
    opportunities: z.array(z.string()).default([]),
    risks: z.array(z.string()).default([]),
  }),
  competitor_insights: z.object({
    key_competitors: z.array(z.any()).default([]),
    pricing_insights: z.array(z.string()).default([]),
    positioning_insights: z.array(z.string()).default([]),
    content_insights: z.array(z.string()).default([]),
  }),
  platform_insights: z.array(z.any()).default([]),
  offer_and_pricing: z.object({
    client_offer: z.string().default(""),
    market_price_range: z.string().default(""),
    recommended_offer_direction: z.string().default(""),
  }),
  brand_guidelines: z.object({
    tone: z.array(z.string()).default([]),
    language: z.array(z.string()).default([]),
    visual_preferences: z.array(z.string()).default([]),
    do: z.array(z.string()).default([]),
    dont: z.array(z.string()).default([]),
  }),
  budget: z.object({
    amount: z.number().nullable().default(null),
    currency: z.string().default("BDT"),
  }),
  timeline: z.object({
    start_date: z.string().default(""),
    end_date: z.string().default(""),
    duration: z.string().default(""),
  }),
  strategic_direction: z.object({
    key_message: z.string().default(""),
    content_direction: z.array(z.string()).default([]),
    campaign_direction: z.array(z.string()).default([]),
  }),
  sources: z.array(z.any()).default([]),
});

// CONVERSATION RESPONSE SCHEMA
export const ConversationTurnSchema = z.object({
  ai_message: z.string(),
  extracted_updates: z.record(z.string(), z.any()).optional().default({}),
  confidence_scores: z.record(z.string(), z.number()).optional().default({}),
  status: z.enum(["collecting", "ready_for_confirmation"]).default("collecting"),
  missing_fields: z.array(z.string()).optional().default([]),
  quick_replies: z.array(z.string()).optional().default([]),
});
