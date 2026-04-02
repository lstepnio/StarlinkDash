import { useState } from 'react';
import { Bot, LoaderCircle, SendHorizontal, Shield, Sparkles } from 'lucide-react';

export default function AssistantPanel({ config }) {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const suggestions = config?.ai_suggested_prompts || [];
  const aiEnabled = !!config?.ai_enabled;

  async function ask(question) {
    const trimmed = question.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail?.message || data?.error?.message || 'AI request failed.');
      }
      setAnswer(data);
      setPrompt(trimmed);
    } catch (err) {
      setError(err.message || 'AI request failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="surface-panel space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <div className="section-eyebrow">Assistant</div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">Ask the dashboard</h2>
            <p className="max-w-3xl text-[13px] leading-relaxed text-slate-400">
              Read-only operational summaries generated from live and historical dashboard metrics.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px]">
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 font-semibold uppercase tracking-[0.16em] text-emerald-300">
            <Shield size={10} />
            Read only
          </span>
          {config?.ai_provider && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/8 bg-white/4 px-2.5 py-1 font-semibold uppercase tracking-[0.16em] text-slate-400">
              <Bot size={10} />
              {config.ai_provider}
            </span>
          )}
          {config?.ai_model && (
            <span className="inline-flex items-center rounded-full border border-white/8 bg-white/4 px-2.5 py-1 font-semibold text-slate-400">
              {config.ai_model}
            </span>
          )}
        </div>
      </div>

      {!aiEnabled ? (
        <div className="rounded-2xl border border-amber-500/15 bg-amber-500/[0.05] px-4 py-4 text-sm text-slate-300">
          <div className="flex items-center gap-2 text-amber-300">
            <Sparkles size={14} />
            AI assistant unavailable
          </div>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            Set <code>AI_API_KEY</code> and <code>AI_MODEL</code> to enable the read-only assistant. Requests are rate limited, cached, and only use sanitized metric summaries.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {suggestions.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setPrompt(item);
                    ask(item);
                  }}
                  disabled={loading}
                  className="rounded-full border border-cyan-400/12 bg-cyan-400/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-200 transition hover:border-cyan-400/25 hover:bg-cyan-400/[0.1] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                Ask a question
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Ask about recent changes, outages, or performance"
                  className="min-w-0 flex-1 rounded-xl border border-white/8 bg-slate-950/40 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-400/25"
                />
                <button
                  type="button"
                  onClick={() => ask(prompt)}
                  disabled={loading || !prompt.trim()}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-400/12 px-4 py-2 text-sm font-medium text-cyan-200 transition hover:bg-cyan-400/18 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? <LoaderCircle size={15} className="animate-spin" /> : <SendHorizontal size={15} />}
                  Ask
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/15 bg-red-500/[0.05] px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Latest answer</div>
              {answer?.cached && (
                <span className="rounded-full border border-emerald-500/15 bg-emerald-500/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300">
                  Cached
                </span>
              )}
            </div>

            {answer ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-slate-200">{answer.answer}</p>
                {answer.citations?.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Metrics used</div>
                    <div className="flex flex-wrap gap-2">
                      {answer.citations.map((item) => (
                        <span
                          key={item}
                          className="rounded-full border border-white/8 bg-slate-950/40 px-2.5 py-1 text-[11px] leading-snug text-slate-300"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-white/8 bg-slate-950/30 px-4 text-center text-sm text-slate-500">
                Choose a suggested prompt or ask your own question for a concise operational summary.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
