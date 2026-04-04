import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ChatBubbleProps {
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  streaming?: boolean;
}

export default function ChatBubble({
  role,
  content,
  createdAt,
  streaming = false,
}: ChatBubbleProps): JSX.Element {
  const isUser = role === "user";

  return (
    <article className={`fade-in flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[94%] rounded-keeba border px-4 py-3 text-sm md:max-w-[75%] ${
          isUser
            ? "border-keeba-borderAccent bg-keeba-primary text-keeba-accentLight"
            : "border-keeba-border bg-keeba-card text-keeba-textPrimary"
        }`}
      >
        <p className="mb-1 text-[11px] uppercase tracking-[1.7px] text-keeba-textMuted">
          {isUser ? "You" : "Keeba"}
        </p>
        {isUser ? (
          <p className="whitespace-pre-wrap leading-relaxed">{content || (streaming ? "..." : "")}</p>
        ) : (
          <div className="chat-markdown leading-relaxed">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content || (streaming ? "..." : "")}</ReactMarkdown>
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          {createdAt ? (
            <span className="text-[10px] uppercase tracking-[1.5px] text-keeba-textDim">
              {new Date(createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          ) : (
            <span />
          )}

          {streaming ? (
            <span className="flex items-center gap-1" aria-label="Keeba is typing">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
