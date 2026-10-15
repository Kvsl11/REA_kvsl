import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function icon(path: string) {
  return function Icon({ size = 20, ...props }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="currentColor"
        aria-hidden="true"
        focusable="false"
        {...props}
      >
        <path d={path} />
      </svg>
    );
  };
}

export const HomeIcon = icon("M12 3 3 10v11h6v-6h6v6h6V10z");
export const SearchIcon = icon(
  "M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z",
);
export const LibraryIcon = icon(
  "M4 3h2v18H4zm5 0h2v18H9zm4.4.6 1.9-.7 6 16.9-1.9.7z",
);
export const PlayIcon = icon(
  "M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z",
);
export const PauseIcon = icon("M6 4h4v16H6zm8 0h4v16h-4z");
export const NextIcon = icon(
  "M5 5.2v13.6a.8.8 0 0 0 1.2.7L16 13v6h2V5h-2v6L6.2 4.5a.8.8 0 0 0-1.2.7z",
);
export const PrevIcon = icon(
  "M19 5.2v13.6a.8.8 0 0 1-1.2.7L8 13v6H6V5h2v6l9.8-6.5a.8.8 0 0 1 1.2.7z",
);
export const ShuffleIcon = icon(
  "M17 3l4 4-4 4V8h-2.2l-3.1 3.6-1.3-1.5L13.9 6H17zM3 6h4.1l9.7 11H17v-3l4 4-4 4v-3h-1.1L6.2 8H3zm0 10h3.2l2.3-2.6 1.3 1.5L7.1 18H3z",
);
export const RepeatIcon = icon(
  "M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z",
);
export const HeartIcon = icon(
  "M12 21s-7.5-4.6-9.6-9.3C.8 8 3 4 6.9 4c2.1 0 3.6 1.1 5.1 2.9C13.5 5.1 15 4 17.1 4 21 4 23.2 8 21.6 11.7 19.5 16.4 12 21 12 21z",
);
export const HeartOutlineIcon = icon(
  "M16.6 4c-1.9 0-3.4 1-4.6 2.6C10.8 5 9.3 4 7.4 4 4 4 1.9 7.6 3.3 11c1.8 4.3 8.7 8.8 8.7 8.8s6.9-4.5 8.7-8.8C22.1 7.6 20 4 16.6 4zm2.3 6.3c-1.3 3.1-5.6 6.4-6.9 7.3-1.3-.9-5.6-4.2-6.9-7.3-.9-2.2.4-4.3 2.3-4.3 1.6 0 2.7 1.1 3.7 2.6l.9 1.4.9-1.4c1-1.5 2.1-2.6 3.7-2.6 1.9 0 3.2 2.1 2.3 4.3z",
);
export const PlusIcon = icon("M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z");
export const MoreIcon = icon(
  "M5 10.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3z",
);
export const QueueIcon = icon(
  "M3 5h14v2H3zm0 6h14v2H3zm0 6h9v2H3zm12-1.5 6 3.5-6 3.5z",
);
export const VolumeIcon = icon(
  "M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z",
);
export const MuteIcon = icon(
  "M3 9v6h4l5 5V4L7 9zm18.7.7-1.4-1.4L18 10.6l-2.3-2.3-1.4 1.4L16.6 12l-2.3 2.3 1.4 1.4 2.3-2.3 2.3 2.3 1.4-1.4-2.3-2.3z",
);
export const MusicIcon = icon(
  "M9 3v11.3A3.5 3.5 0 1 0 11 17.5V8h8V3zm-1.5 16a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z",
);
export const CloseIcon = icon(
  "M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6 10.6 12 5 6.4z",
);
export const BackIcon = icon("M15.4 4.6 8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z");
export const ChevronDownIcon = icon("M5.4 8.6 12 15.2l6.6-6.6L20 10l-8 8-8-8z");
export const MicIcon = icon(
  "M12 2a3.5 3.5 0 0 0-3.5 3.5v6a3.5 3.5 0 0 0 7 0v-6A3.5 3.5 0 0 0 12 2zm-7 9.5h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.93V21h3v2H8v-2h3v-2.57A7 7 0 0 1 5 11.5z",
);
export const ChartIcon = icon(
  "M3 20h18v2H3zm2-9h3v7H5zm5.5-5h3v12h-3zM16 9h3v9h-3z",
);
export const UploadIcon = icon(
  "M12 3l5 5-1.4 1.4L13 6.8V16h-2V6.8L8.4 9.4 7 8zM4 15h2v4h12v-4h2v6H4z",
);
export const SettingsIcon = icon(
  "M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.4-2.5 1a7.4 7.4 0 0 0-1.7-1L14.9 3h-4l-.4 3a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.4L6.4 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.4 2.5-1c.5.4 1.1.7 1.7 1l.4 3h4l.4-3c.6-.3 1.2-.6 1.7-1l2.5 1 2-3.4zM12.9 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z",
);
export const ClockIcon = icon(
  "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3v6l5 3 1-1.7-4-2.3V7z",
);
export const EditIcon = icon(
  "M4 17.2V20h2.8l9.4-9.4-2.8-2.8zM19.7 7.1a1 1 0 0 0 0-1.4l-1.4-1.4a1 1 0 0 0-1.4 0l-1.2 1.2 2.8 2.8z",
);
export const ArrowUpIcon = icon(
  "M12 5l7 7-1.4 1.4-4.6-4.6V20h-2V8.8l-4.6 4.6L5 12z",
);
export const ArrowDownIcon = icon(
  "M12 19l-7-7 1.4-1.4 4.6 4.6V4h2v11.2l4.6-4.6L19 12z",
);
export const StopIcon = icon("M6 6h12v12H6z");
export const CoffeeIcon = icon(
  "M3 7h14v6a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6zm14 1h1.5a3 3 0 0 1 0 6H17v-2h1.5a1 1 0 0 0 0-2H17zM3 21h16v2H3zM8 1h2v4H8zm4 0h2v4h-2z",
);
export const CheckIcon = icon("M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z");
export const LyricsIcon = icon(
  "M4 5h11v2H4zm0 4h16v2H4zm0 4h9v2H4zm0 4h13v2H4zm14.5-4.5a2.5 2.5 0 1 1-1.5 4.5V11h4v1.5h-2.5z",
);
export const SyncIcon = icon(
  "M12 4V1L8 5l4 4V6a6 6 0 0 1 5.7 7.9l1.5 1.5A8 8 0 0 0 12 4zm0 14a6 6 0 0 1-5.7-7.9L4.8 8.6A8 8 0 0 0 12 20v3l4-4-4-4z",
);
export const SparkIcon = icon(
  "M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8zm7 11 .9 2.1L22 16l-2.1.9L19 19l-.9-2.1L16 16l2.1-.9zM5 15l.7 1.6L7.3 17l-1.6.7L5 19.3l-.7-1.6L2.7 17l1.6-.4z",
);
export const GuitarIcon = icon(
  "M20.7 3.3a1 1 0 0 0-1.4 0l-1.9 1.9-.7-.7-1.4 1.4.7.7-3.4 3.4a5 5 0 0 0-5.9.9 4.6 4.6 0 0 0-1.1 2.5 2.4 2.4 0 0 1-1.8 1.9A3 3 0 0 0 2.4 18c.4 2 2.6 3.9 4.6 4.1a3 3 0 0 0 2.6-1.5 2.4 2.4 0 0 1 2-1.4 4.6 4.6 0 0 0 2.5-1.2 5 5 0 0 0 .9-5.8l3.4-3.4.7.7 1.4-1.4-.7-.7 1.9-1.9a1 1 0 0 0 0-1.4zM9.6 16.4a1.5 1.5 0 1 1-2.1-2.1 1.5 1.5 0 0 1 2.1 2.1z",
);
