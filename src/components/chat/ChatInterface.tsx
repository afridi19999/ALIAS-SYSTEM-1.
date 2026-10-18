"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, Bot, User, Sparkles, AlertCircle, ArrowRight } from "lucide-react";
import { DEFAULT_UI_LANG, UI_DEFAULT_QUICK_REPLIES, UI_GREETINGS } from "@/lib/ai/ui-text";

interface Message {
  _id?: string;
  sender: "user" | "ai" | "system";
  content: string;
  extractedFields?: any;
}

export default function ChatInterface({
  campaignId,
  onArtifactUpdate,
}: {
  campaignId: string;
  onArtifactUpdate: (artifact: any) => void;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [quickReplies, setQuickReplies] = useState<string[]>([
    ...UI_DEFAULT_QUICK_REPLIES[DEFAULT_UI_LANG],
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isReadyForConfirmation, setIsReadyForConfirmation] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userJustSentRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea to fit multiline content line by line as user types or pastes
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      if (input) {
        textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
      }
    }
  }, [input]);

  // Load chat history on mount
  useEffect(() => {
    let isMounted = true;
    async function loadHistory() {
      try {
        const res = await fetch(`/api/conversations/${campaignId}`);
        if (!res.ok) {
          let msg = "Failed to load conversation";
          try {
            const errData = await res.json();
            if (errData.error) msg = errData.error;
          } catch {}
          if (isMounted) setFetchError(msg);
          return;
        }
        const data = await res.json();
        if (isMounted && data.messages) {
          userJustSentRef.current = true;
          setMessages(data.messages);
          if (Array.isArray(data.quickReplies)) {
            setQuickReplies(data.quickReplies);
          }
          const hasSystem = data.messages.some((m: Message) => m.sender === "system");
          if (hasSystem) setIsReadyForConfirmation(true);
        }
      } catch (err: any) {
        if (isMounted) setFetchError(err.message || "Failed to load conversation");
      }
    }
    loadHistory();
    return () => {
      isMounted = false;
    };
  }, [campaignId]);

  const scrollToBottom = (smooth = true) => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.scrollTo({
      top: container.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  };

  // Scroll to bottom only when a new message arrives AND user is already near bottom, or when user just sent a message
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const isNearBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight <= 100;

    if (userJustSentRef.current || isNearBottom) {
      scrollToBottom(true);
      userJustSentRef.current = false;
    }
  }, [messages, isLoading, isReadyForConfirmation]);

  const handleSend = async (customText?: string) => {
    const textToSend = (customText || input).trim();
    if (!textToSend || isLoading) return;

    userJustSentRef.current = true;
    const userMsg: Message = { sender: "user", content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setFetchError(null);

    try {
      const res = await fetch(`/api/conversations/${campaignId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: textToSend }),
      });

      if (!res.ok) {
        let errMessage = "Server returned an error";
        try {
          const errData = await res.json();
          if (errData.error) errMessage = errData.error;
        } catch {
          // not json
        }
        setFetchError(errMessage);
        return;
      }

      const data = await res.json();

      // Append AI message and persistent system message
      const newIncoming: Message[] = [];
      if (data.aiMessage) newIncoming.push(data.aiMessage);
      if (data.systemMessage) newIncoming.push(data.systemMessage);

      if (newIncoming.length > 0) {
        setMessages((prev) => [...prev, ...newIncoming]);
      }

      // Update dynamic contextual quick replies for the new question
      if (Array.isArray(data.quickReplies)) {
        setQuickReplies(data.quickReplies);
      }

      if (data.artifact) {
        onArtifactUpdate(data.artifact);
      }

      if (data.status === "ready_for_confirmation") {
        setIsReadyForConfirmation(true);
      }
    } catch (error: any) {
      setFetchError(error.message || "Failed to send message. Please retry.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-auto p-6">
        <div className="flex flex-col gap-5 pb-6">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 ${
                msg.sender === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
                  msg.sender === "user"
                    ? "bg-blue-600 text-white"
                    : msg.sender === "system"
                    ? "bg-amber-500 text-white"
                    : "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                }`}
              >
                {msg.sender === "user" ? (
                  <User className="w-4 h-4" />
                ) : msg.sender === "system" ? (
                  <Sparkles className="w-4 h-4" />
                ) : (
                  <Bot className="w-4 h-4" />
                )}
              </div>

              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap break-words ${
                  msg.sender === "user"
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : msg.sender === "system"
                    ? "bg-amber-50 text-amber-950 border border-amber-300 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-800 shadow-xs font-medium"
                    : "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 border border-zinc-200/80 dark:border-zinc-800 shadow-xs rounded-tl-sm"
                }`}
              >
                {msg.sender === "ai" &&
                idx === 0 &&
                (msg.content.startsWith("Hello! I am your AI Marketing Consultant") ||
                  msg.content === UI_GREETINGS.en) &&
                DEFAULT_UI_LANG === "bn"
                  ? UI_GREETINGS.bn
                  : msg.content}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4" />
              </div>
              <div className="rounded-2xl px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xs flex items-center gap-1.5 text-zinc-400">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse delay-150"></span>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 animate-pulse delay-300"></span>
              </div>
            </div>
          )}

          {fetchError && (
            <div className="flex items-center justify-between gap-3 p-3.5 text-xs bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60 rounded-xl">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span className="font-medium">{fetchError}</span>
              </div>
              {fetchError.toLowerCase().includes("not found") && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push("/campaign/new")}
                  className="text-xs h-7 px-2.5 bg-white dark:bg-zinc-900 border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100"
                >
                  Start New Campaign
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Persistent Yellow/Amber Confirmation Prompt Banner */}
      {isReadyForConfirmation && (
        <div className="mx-4 mb-2 p-3 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800 rounded-xl flex items-center justify-between shadow-xs animate-in fade-in slide-in-from-bottom-2 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-950 dark:text-amber-200">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Campaign facts captured! Ready for verification.</span>
          </div>
          <Button
            size="sm"
            onClick={() => router.push(`/campaign/${campaignId}/confirmation`)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs h-8 px-3 shadow-xs"
          >
            Review & Confirm <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      )}

      {/* Dynamic Contextual Quick Replies (Updates on every single question asked) */}
      {quickReplies && quickReplies.length > 0 && (
        <div className="px-4 py-2.5 bg-zinc-100/90 dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-center gap-2 overflow-x-auto text-xs scrollbar-none shrink-0">
          <span className="text-zinc-500 font-semibold shrink-0 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-blue-600 shrink-0" /> Quick reply:
          </span>
          <div className="flex items-center gap-2 shrink-0">
            {quickReplies.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleSend(prompt)}
                disabled={isLoading}
                className="px-3 py-1.5 bg-white dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-zinc-900 dark:text-zinc-100 hover:text-blue-700 dark:hover:text-blue-300 border border-zinc-300 dark:border-zinc-700 hover:border-blue-400 rounded-full font-medium transition-all shadow-2xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Multiline Input Bar (Shows long text line by line so client can see their full message) */}
      <div className="p-3.5 bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 flex items-end gap-2.5 shrink-0">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type your message... (Press Enter to send, Shift + Enter for new line)"
          disabled={isLoading}
          rows={1}
          className="flex-1 min-h-[44px] max-h-[160px] resize-none overflow-y-auto rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50/70 dark:bg-zinc-800/60 px-3.5 py-2.5 text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all leading-relaxed whitespace-pre-wrap break-words"
        />
        <Button
          onClick={() => handleSend()}
          disabled={isLoading || !input.trim()}
          className="h-[44px] w-[44px] p-0 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shrink-0 flex items-center justify-center shadow-xs disabled:opacity-50 cursor-pointer"
          title="Send message"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
