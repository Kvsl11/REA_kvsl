import { useState } from "react";
import { MusicIcon } from "./Icons";

export function Cover({
  src,
  alt,
  className = "",
  round = false,
}: {
  src: string;
  alt: string;
  className?: string;
  round?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const classes = `cover ${round ? "cover-round" : ""} ${className}`;
  if (!src || failed) {
    return (
      <div
        className={`${classes} cover-placeholder`}
        role="img"
        aria-label={alt}
      >
        <MusicIcon size={28} />
      </div>
    );
  }
  return (
    <img
      className={classes}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
