"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, Sparkles, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const STEPS = [
  "Understanding business profile",
  "Identifying target market & size",
  "Researching direct competitors & offers",
  "Analyzing audience psychographics & pain points",
  "Evaluating marketing platforms & ad formats",
  "Researching market pricing & discount trends",
  "Identifying industry trends & opportunities",
  "Synthesizing Master Campaign Brief",
];

export default function ResearchPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasTriggered = useRef(false);

  const startResearch = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setCurrentStep(0);

    const stepInterval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev < STEPS.length - 2) return prev + 1;
        return prev;
      });
    }, 1800);

    try {
      const res = await fetch(`/api/research/${campaignId}/start`, { method: "POST" });
      if (!res.ok) {
        let errMessage = "Research pipeline encountered an error";
        try {
          const errData = await res.json();
          if (errData.error) errMessage = errData.error;
        } catch {
          // not json
        }
        throw new Error(errMessage);
      }

      clearInterval(stepInterval);
      setCurrentStep(STEPS.length);
      setIsCompleted(true);
      setIsLoading(false);
    } catch (err: any) {
      clearInterval(stepInterval);
      console.error("[Research] Error:", err);
      setError(err.message || "Failed to execute research pipeline.");
      setIsLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    if (!hasTriggered.current) {
      hasTriggered.current = true;
      startResearch();
    }
  }, [startResearch]);

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-6 md:p-12 flex flex-col items-center justify-center">
      <div className="max-w-lg w-full flex flex-col gap-6">
        <div className="text-center flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-500/20 mb-1">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Research & Enrichment AI
          </h1>
          <p className="text-sm text-zinc-500">
            Conducting external market research, competitor benchmarking, audience intelligence, and
            strategy synthesis.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-sm flex flex-col gap-2">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Research Pipeline Notice</span>
            </div>
            <p className="text-xs text-rose-600">{error}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => startResearch()}
              className="w-fit mt-1 border-rose-300 text-rose-800"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry Research
            </Button>
          </div>
        )}

        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
          <ul className="flex flex-col gap-4">
            {STEPS.map((step, idx) => {
              const isDone = isCompleted || idx < currentStep;
              const isActive = !isCompleted && !error && idx === currentStep;

              return (
                <li key={idx} className="flex items-center gap-3.5 text-sm">
                  {isDone ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  ) : isActive ? (
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                  ) : (
                    <Circle className="w-5 h-5 text-zinc-300 dark:text-zinc-700 shrink-0" />
                  )}
                  <span
                    className={
                      isDone
                        ? "text-zinc-900 dark:text-zinc-100 font-medium"
                        : isActive
                        ? "text-blue-600 dark:text-blue-400 font-semibold"
                        : "text-zinc-400"
                    }
                  >
                    {step}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        {isCompleted && (
          <div className="flex flex-col items-center gap-3 animate-in fade-in slide-in-from-bottom-3 duration-500">
            <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
              <span>Research complete. Master Brief generated.</span>
            </div>
            <Button
              size="lg"
              onClick={() => router.push(`/campaign/${campaignId}/brief`)}
              className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/20"
            >
              View Master Campaign Brief <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
