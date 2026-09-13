import { useEffect, useRef, useState } from "react";
import { INGAME_SEARCH_MAX_LENGTH } from "../lib/regex";

interface Props {
  regex: string;
  warnings: string[];
}

export function RegexOutput({ regex, warnings }: Props) {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tooLong = regex.length > INGAME_SEARCH_MAX_LENGTH;

  useEffect(() => {
    if (!copied) return;
    const timeout = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timeout);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(regex);
      setCopied(true);
    } catch {
      // Clipboard API unavailable (insecure context, permission denied) —
      // select the text instead so a plain Ctrl+C still works.
      textareaRef.current?.select();
    }
  }

  return (
    <section className="regex-output">
      <h2>Regex</h2>
      <textarea
        ref={textareaRef}
        aria-label="Generated regex"
        readOnly
        spellCheck={false}
        value={regex}
        placeholder="Choose modifiers to generate a regex…"
      />
      <div className="regex-output-footer">
        <span
          className={`regex-length${tooLong ? " regex-length-over" : ""}`}
          title={`The in-game search box accepts at most ${INGAME_SEARCH_MAX_LENGTH} characters`}
        >
          {regex.length}/{INGAME_SEARCH_MAX_LENGTH}
        </span>
        <button type="button" className="regex-copy-button" onClick={handleCopy} disabled={!regex}>
          {copied ? "Copied" : "Copy regex"}
        </button>
      </div>
      {tooLong && <p className="error">Too long for the in-game search box — remove a modifier or two.</p>}
      {warnings.length > 0 && (
        <ul className="regex-warnings">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="hint">Paste it into the search box of your stash or a vendor window in game.</p>
    </section>
  );
}
