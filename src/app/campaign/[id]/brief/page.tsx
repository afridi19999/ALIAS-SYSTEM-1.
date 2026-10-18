"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FileText,
  Target,
  TrendingUp,
  Users,
  Compass,
  DollarSign,
  Calendar,
  Share2,
  ExternalLink,
  Code,
  ArrowLeft,
  CheckCircle2,
  Sparkles,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import Link from "next/link";

export default function MasterBriefPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const [brief, setBrief] = useState<any>(null);
  const [showRawJson, setShowRawJson] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/master-brief/${campaignId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load Master Campaign Brief");
        return res.json();
      })
      .then((data) => {
        if (data.brief) setBrief(data.brief);
      })
      .catch((err) => setError(err.message));
  }, [campaignId]);

  if (!brief) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-6">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-sm text-zinc-500">Loading Master Campaign Brief...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 md:p-12">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        {/* Top Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-6">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                Stage 6: Master Strategic Brief
              </span>
              <span className="text-xs text-zinc-400">•</span>
              <span className="text-xs text-zinc-500 font-mono">v{brief.version || "1.0"}</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
              {brief.campaign_summary?.campaign_name || "Master Campaign Brief"}
            </h1>
            <p className="text-sm text-zinc-500">
              Downstream-ready strategic blueprint synthesized from Artifact-1 (Client Facts) &
              Artifact-2 (Market Research).
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRawJson(!showRawJson)}
              className="text-xs"
            >
              <Code className="w-3.5 h-3.5 mr-1.5" /> {showRawJson ? "Formatted View" : "Raw JSON"}
            </Button>
            <Link href="/admin">
              <Button variant="outline" size="sm" className="text-xs">
                Admin Panel
              </Button>
            </Link>
            <Link href="/">
              <Button size="sm" className="text-xs">
                New Campaign
              </Button>
            </Link>
          </div>
        </header>

        {showRawJson ? (
          <Card className="p-6 bg-zinc-900 text-zinc-100 font-mono text-xs overflow-x-auto rounded-2xl">
            <pre className="whitespace-pre-wrap">{JSON.stringify(brief, null, 2)}</pre>
          </Card>
        ) : (
          <div className="flex flex-col gap-8">
            {/* 1. Campaign Summary */}
            <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
              <div className="flex items-center gap-2.5 font-bold text-lg text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <FileText className="w-5 h-5 text-blue-600" />
                <span>Executive Campaign Summary</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-zinc-500 font-medium">Business / Entity:</span>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {brief.campaign_summary?.business}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500 font-medium">Product / Offering:</span>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {brief.campaign_summary?.product_service}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500 font-medium">Campaign Objective:</span>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {brief.campaign_summary?.objective}
                  </p>
                </div>
                <div>
                  <span className="text-zinc-500 font-medium">Desired Result:</span>
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                    {brief.campaign_summary?.desired_result}
                  </p>
                </div>
              </div>
            </Card>

            {/* 2. Target Audience: Client Stated vs Research Insights */}
            <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
              <div className="flex items-center gap-2.5 font-bold text-lg text-zinc-900 dark:text-zinc-100 mb-4 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <Users className="w-5 h-5 text-indigo-600" />
                <span>Target Audience Intelligence</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Client Stated */}
                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                    Source: Client-Stated Facts
                  </span>
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    <div>
                      <span className="text-zinc-500 text-xs">Age Range:</span>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {brief.target_audience?.client_stated?.age_range || "Not specified"}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Location:</span>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {brief.target_audience?.client_stated?.location || "Not specified"}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-500 text-xs">Description:</span>
                      <p className="font-medium text-zinc-900 dark:text-zinc-100">
                        {brief.target_audience?.client_stated?.description || "Not specified"}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Research Insights */}
                <div className="p-4 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/50">
                  <span className="text-xs font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-400">
                    Source: Research-Derived Insights
                  </span>
                  <div className="mt-3 flex flex-col gap-2 text-sm">
                    {brief.target_audience?.research_insights ? (
                      Object.entries(brief.target_audience.research_insights).map(([k, v]: any, i) => (
                        <div key={i}>
                          <span className="text-zinc-500 text-xs capitalize">
                            {k.replace(/_/g, " ")}:
                          </span>
                          <p className="font-medium text-zinc-900 dark:text-zinc-100">
                            {Array.isArray(v) ? v.join(", ") : String(v)}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-zinc-400">Audience insights generated</p>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* 3. Strategic Direction */}
            <Card className="p-6 bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-2xl shadow-md border-0">
              <div className="flex items-center gap-2.5 font-bold text-lg mb-3">
                <Compass className="w-5 h-5 text-blue-300" />
                <span>Strategic Campaign Direction</span>
              </div>
              <div className="flex flex-col gap-4">
                <div className="p-4 rounded-xl bg-white/10 backdrop-blur-xs border border-white/15">
                  <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                    Core Campaign Message
                  </span>
                  <p className="text-base font-medium mt-1 leading-relaxed text-zinc-100">
                    "{brief.strategic_direction?.key_message}"
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                      Content Creative Direction
                    </span>
                    <ul className="mt-2 flex flex-col gap-1.5 text-xs text-zinc-200">
                      {brief.strategic_direction?.content_direction?.map((item: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
                      Phased Execution Direction
                    </span>
                    <ul className="mt-2 flex flex-col gap-1.5 text-xs text-zinc-200">
                      {brief.strategic_direction?.campaign_direction?.map((item: string, i: number) => (
                        <li key={i} className="flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </Card>

            {/* 4. Market & Competitors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Market Insights */}
              <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs flex flex-col gap-4">
                <div className="flex items-center gap-2 font-bold text-base text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span>Market Intelligence</span>
                </div>
                <div className="flex flex-col gap-3 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-zinc-500 uppercase">Key Trends</span>
                    <ul className="mt-1 flex flex-col gap-1 text-xs">
                      {brief.market_insights?.trends?.map((t: string, i: number) => (
                        <li key={i} className="text-zinc-700 dark:text-zinc-300">• {t}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-zinc-500 uppercase">Opportunities</span>
                    <ul className="mt-1 flex flex-col gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                      {brief.market_insights?.opportunities?.map((o: string, i: number) => (
                        <li key={i}>✓ {o}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </Card>

              {/* Offer & Pricing */}
              <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs flex flex-col gap-4">
                <div className="flex items-center gap-2 font-bold text-base text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-800 pb-3">
                  <DollarSign className="w-4 h-4 text-teal-600" />
                  <span>Offer & Pricing Strategy</span>
                </div>
                <div className="flex flex-col gap-3 text-sm">
                  <div>
                    <span className="text-xs text-zinc-500 font-medium">Market Price Range:</span>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                      {brief.offer_and_pricing?.market_price_range || "Competitive market"}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-teal-50 dark:bg-teal-950/30 border border-teal-100 dark:border-teal-900/50">
                    <span className="text-xs font-semibold text-teal-800 dark:text-teal-300 uppercase">
                      Recommended Offer Direction
                    </span>
                    <p className="text-xs text-teal-900 dark:text-teal-200 mt-1 leading-relaxed">
                      {brief.offer_and_pricing?.recommended_offer_direction}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* 5. Budget, Timeline & Brand Guidelines */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 font-bold text-base text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
                  <Calendar className="w-4 h-4 text-amber-600" />
                  <span>Budget & Execution Timeline</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-zinc-500 text-xs">Total Budget:</span>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                      {brief.budget?.amount
                        ? `${brief.budget.amount.toLocaleString()} ${brief.budget.currency || "BDT"}`
                        : "To be determined"}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500 text-xs">Duration:</span>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
                      {brief.timeline?.duration || "1 Month"}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                <div className="flex items-center gap-2 font-bold text-base text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-800 pb-3 mb-4">
                  <Sparkles className="w-4 h-4 text-purple-600" />
                  <span>Brand Guidelines</span>
                </div>
                <div className="flex flex-col gap-2 text-xs">
                  <div>
                    <span className="text-zinc-500 font-medium">Tone of Voice:</span>
                    <p className="text-zinc-800 dark:text-zinc-200 font-medium">
                      {brief.brand_guidelines?.tone?.join(", ") || "Professional & Contemporary"}
                    </p>
                  </div>
                  <div>
                    <span className="text-zinc-500 font-medium">Visual Aesthetics:</span>
                    <p className="text-zinc-800 dark:text-zinc-200 font-medium">
                      {brief.brand_guidelines?.visual_preferences?.join(", ") || "Clean, high-contrast"}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* 6. Sources & Provenance */}
            {brief.sources && brief.sources.length > 0 && (
              <Card className="p-6 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-xs">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 block">
                  Research Sources & Data Provenance
                </span>
                <div className="flex flex-col gap-2.5">
                  {brief.sources.map((src: any, i: number) => (
                    <div
                      key={i}
                      className="flex items-center justify-between text-xs p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-100 dark:border-zinc-800"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{src.title}</span>
                        <span className="text-zinc-400">{src.source_type} • {src.research_date}</span>
                      </div>
                      <a
                        href={src.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1 font-medium"
                      >
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
