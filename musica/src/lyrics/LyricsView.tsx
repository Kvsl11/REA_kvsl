import { useEffect, useRef, useState } from "react";
import { activeLine, type LyricLine } from "./lrc";

/**
 * Spotify-style lyrics: the line being sung is bright, sung lines fade,
 * the view follows the song until the user scrolls, and tapping a line
 * jumps there (when `onSeek` is given).
 */
export function LyricsView({
  lines,
  plain,
  offsetMs,
  getTime,
  onSeek,
  variant = "page",
  follow: followProp = true,
}: {
  lines: LyricLine[];
  plain: string;
  offsetMs: number;
  /** Current song position in seconds; null pauses highlighting. */
  getTime: (() => number) | null;
  onSeek?: (seconds: number) => void;
  variant?: "page" | "stage" | "card";
  /** Auto-scroll to the current line. */
  follow?: boolean;
}) {
  const [current, setCurrent] = useState(-1);
  const [userScrolled, setUserScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const synced = lines.length > 0;

  // Read the clock every frame, re-render only when the line changes.
  useEffect(() => {
    if (!synced || !getTime) return;
    let frame = 0;
    let last = -2;
    const tick = () => {
      const index = activeLine(lines, getTime(), offsetMs);
      if (index !== last) {
        last = index;
        setCurrent(index);
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [synced, lines, offsetMs, getTime]);

  const following = followProp && !userScrolled;
  useEffect(() => {
    if (!following || current < 0) return;
    const container = containerRef.current;
    const line = lineRefs.current[current];
    if (!container || !line) return;
    // Keep the current line about a third from the top, like Spotify.
    const target = line.offsetTop - container.clientHeight / 3;
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
  }, [current, following]);

  // A wheel, drag or touch on the lyrics means "let me read": stop following.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !synced) return;
    const stop = () => setUserScrolled(true);
    container.addEventListener("wheel", stop, { passive: true });
    container.addEventListener("touchmove", stop, { passive: true });
    return () => {
      container.removeEventListener("wheel", stop);
      container.removeEventListener("touchmove", stop);
    };
  }, [synced]);

  if (!synced) {
    return (
      <div
        className={`lyrics lyrics-${variant} lyrics-plain`}
        ref={containerRef}
      >
        {plain.split(/\n{2,}/).map((stanza, index) => (
          <p key={index} className="lyrics-stanza">
            {stanza.split("\n").map((line, lineIndex) => (
              <span key={lineIndex} className="lyrics-line">
                {line}
              </span>
            ))}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className={`lyrics-wrap lyrics-wrap-${variant}`}>
      <div
        className={`lyrics lyrics-${variant}`}
        ref={containerRef}
        data-testid="lyrics"
      >
        {lines.map((line, index) => {
          const state =
            index === current ? "is-active" : index < current ? "is-past" : "";
          const text = line.text || "♪";
          const content = onSeek ? (
            <button
              type="button"
              className="lyrics-line-button"
              onClick={() => {
                onSeek(Math.max(0, line.time - offsetMs / 1000));
                setUserScrolled(false);
              }}
            >
              {text}
            </button>
          ) : (
            text
          );
          return (
            <p
              key={`${line.time}-${index}`}
              ref={(element) => {
                lineRefs.current[index] = element;
              }}
              className={`lyrics-line ${state} ${line.text ? "" : "is-gap"}`}
              aria-current={index === current ? "true" : undefined}
            >
              {content}
            </p>
          );
        })}
        <div className="lyrics-end" aria-hidden="true" />
      </div>
      {followProp && userScrolled && (
        <button
          type="button"
          className="lyrics-resync button-primary button-small"
          onClick={() => setUserScrolled(false)}
        >
          Voltar à música
        </button>
      )}
    </div>
  );
}
