"use client";

import { CheckCircle2, Circle, HelpCircle, ArrowRight, ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

interface PreviewItem {
  label: string;
  value: any;
  isUnknown?: boolean;
}

interface PreviewSection {
  title: string;
  data: PreviewItem[];
}

export default function LiveArtifactPreview({
  artifact,
  campaignId,
}: {
  artifact: any;
  campaignId: string;
}) {
  const router = useRouter();

  if (!artifact) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-zinc-400 gap-3 text-center">
        <Circle className="w-10 h-10 stroke-1 opacity-20" />
        <p className="text-sm">Listening to conversation...</p>
        <p className="text-xs text-zinc-500 max-w-xs">
          Facts provided in the chat will be structured and displayed here in real time.
        </p>
      </div>
    );
  }

  const sections: PreviewSection[] = [
    {
      title: "Business Information",
      data: [
        { label: "Company", value: artifact.client?.company_name },
        { label: "Industry", value: artifact.client?.industry },
        { label: "Website", value: artifact.client?.website },
      ],
    },
    {
      title: "Product / Service",
      data: [
        { label: "Product Name", value: artifact.product_service?.name },
        { label: "Type", value: artifact.product_service?.type },
        {
          label: "Price",
          value: artifact.product_service?.price ? `BDT ${artifact.product_service.price}` : null,
        },
      ],
    },
    {
      title: "Campaign Strategy",
      data: [
        { label: "Objective", value: artifact.campaign?.objective },
        { label: "Desired Result", value: artifact.campaign?.desired_result },
      ],
    },
    {
      title: "Target Audience (Stated)",
      data: [
        { label: "Age Range", value: artifact.target_audience?.age_range },
        { label: "Location", value: artifact.target_audience?.location },
        { label: "Audience Notes", value: artifact.target_audience?.description },
      ],
    },
    {
      title: "Budget",
      data: [
        {
          label: "Budget Status",
          value:
            artifact.budget?.type === "unknown"
              ? "Marked as Unknown (will be researched)"
              : artifact.budget?.amount
              ? `${artifact.budget.amount.toLocaleString()} ${artifact.budget.currency || "BDT"} (${artifact.budget.type || "exact"})`
              : null,
          isUnknown: artifact.budget?.type === "unknown",
        },
      ],
    },
    {
      title: "Timeline",
      data: [{ label: "Duration", value: artifact.timeline?.duration }],
    },
  ];

  // Count collected fields
  let totalFields = 0;
  let collectedFields = 0;
  sections.forEach((sec) => {
    sec.data.forEach((item) => {
      totalFields++;
      if (item.value) collectedFields++;
    });
  });

  const completionPct = totalFields > 0 ? Math.round((collectedFields / totalFields) * 100) : 0;

  // Verify 6 Core Requirements
  const missingCoreRequirements: string[] = [];
  if (!artifact?.client?.company_name) missingCoreRequirements.push("Company Name");
  if (!artifact?.product_service?.name) missingCoreRequirements.push("Product / Service");
  if (!artifact?.campaign?.objective) missingCoreRequirements.push("Campaign Objective");
  if (!artifact?.target_audience?.description && !artifact?.target_audience?.location && !artifact?.target_audience?.age_range) {
    missingCoreRequirements.push("Target Audience");
  }
  const hasBudget = Boolean(artifact?.budget?.amount) || artifact?.budget?.type === "unknown";
  if (!hasBudget) missingCoreRequirements.push("Marketing Budget");
  if (!artifact?.timeline?.duration) missingCoreRequirements.push("Timeline Duration");

  const isReadyForConfirmation = missingCoreRequirements.length === 0;

  const handleConfirm = () => {
    if (!isReadyForConfirmation) return;
    router.push(`/campaign/${campaignId}/confirmation`);
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      {/* Header Badge */}
      <div className="flex items-center justify-between p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
          <span className="text-xs font-semibold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
            Artifact-1: Client Facts
          </span>
        </div>
        <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
          {collectedFields}/{totalFields} Captured ({completionPct}%)
        </span>
      </div>

      {/* Structured Sections */}
      <div className="flex flex-col gap-5">
        {sections.map((section, idx) => (
          <div
            key={idx}
            className="flex flex-col gap-2.5 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/40"
          >
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              {section.title}
            </h3>
            <div className="grid grid-cols-1 gap-2">
              {section.data.map((item, i) => {
                const hasValue = Boolean(item.value);
                return (
                  <div key={i} className="flex items-start gap-2.5 text-xs">
                    {hasValue ? (
                      item.isUnknown ? (
                        <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      )
                    ) : (
                      <Circle className="w-4 h-4 text-zinc-300 dark:text-zinc-700 shrink-0 mt-0.5" />
                    )}
                    <div className="flex flex-col leading-tight">
                      <span className="text-zinc-500 font-medium">{item.label}</span>
                      <span
                        className={
                          hasValue
                            ? item.isUnknown
                              ? "text-amber-700 dark:text-amber-400 font-medium"
                              : "text-zinc-900 dark:text-zinc-100 font-semibold"
                            : "text-zinc-400 italic"
                        }
                      >
                        {item.value || "Not provided yet"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Confirmation Call to Action (Gated by Core Requirements) */}
      {!isReadyForConfirmation ? (
        <div className="p-4 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 shadow-xs flex flex-col gap-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>Intake in Progress ({6 - missingCoreRequirements.length}/6 Core Requirements Captured)</span>
          </div>
          <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
            All essential requirements must be discussed in the conversation before this brief can be confirmed and passed to the research agent.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider self-center">Still needed:</span>
            {missingCoreRequirements.map((req, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-amber-100/90 dark:bg-amber-900/60 text-amber-950 dark:text-amber-200 border border-amber-200 dark:border-amber-800"
              >
                {req}
              </span>
            ))}
          </div>
          <Button
            disabled
            variant="outline"
            className="w-full h-11 text-xs font-medium text-zinc-400 dark:text-zinc-500 border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-900/60 cursor-not-allowed mt-1"
          >
            Complete Remaining Details in Chat to Unlock
          </Button>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 shadow-xs flex flex-col gap-3 animate-in fade-in">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>All 6 core requirements captured! Ready for verification.</span>
          </div>
          <p className="text-[11px] text-emerald-800/80 dark:text-emerald-300/80">
            Artifact-1 will be finalized and locked to launch autonomous market research.
          </p>
          <Button
            onClick={handleConfirm}
            className="w-full h-11 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
          >
            Review & Confirm Artifact-1 <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}
