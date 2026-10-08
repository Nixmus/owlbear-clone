import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  select: <path d="M4 3l7 17 2.5-6.5L20 11z" />,
  pan: (
    <path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-1V4.5a1.5 1.5 0 0 1 3 0V11m0-1.5a1.5 1.5 0 0 1 3 0V13m0-1.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-1.5a6 6 0 0 1-5.2-3L5 15a1.7 1.7 0 0 1 2.8-1.9L9 15" />
  ),
  ruler: <path d="M3 15L15 3l6 6L9 21zM7.5 10.5l2 2M11 7l2 2M4 14l2 2" />,
  pen: <path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18zM2 2l7.6 7.6" />,
  line: <path d="M4 20L20 4" />,
  rect: <rect x="4" y="5" width="16" height="14" rx="1" />,
  circle: <circle cx="12" cy="12" r="8" />,
  reveal: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  fog: <path d="M6 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1A4 4 0 0 1 18 18z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  undo: <path d="M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3" />,
  clear: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />,
  reset: <path d="M21 12a9 9 0 1 1-2.6-6.4M21 4v5h-5" />,
  link: <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />,
  user: <path d="M20 21a8 8 0 1 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
  crown: <path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z" />,
  image: (
    <>
      <rect x="3" y="3" width="18" height="16" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </>
  ),
  dice: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="M9 9h.01M15 9h.01M9 15h.01M15 15h.01M12 12h.01" />
    </>
  ),
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  map: <path d="M9 3L3 5v16l6-2 6 2 6-2V3l-6 2zM9 3v16M15 5v16" />,
  lock: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  eyeoff: (
    <path d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.2 4.2M9.9 5.1A10 10 0 0 1 21 12c-.5 1-1.2 2-2.1 2.8M6.2 6.2C4 7.6 2.6 9.7 2 12c1.7 3.5 5.3 6 10 6 .9 0 1.8-.1 2.6-.4" />
  ),
  check: <path d="M20 6L9 17l-5-5" />,
  upload: <path d="M12 19V5M5 12l7-7 7 7" />,
  file: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  overview: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  members: (
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  edit: <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />,
  trash: <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6" />,
  home: <path d="M3 10.5L12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" />,
  back: <path d="M19 12H5M12 19l-7-7 7-7" />,
  forward: <path d="M5 12h14M12 5l7 7-7 7" />,
  eraser: <path d="M20 20H8.5L3.7 15.2a2 2 0 0 1 0-2.8l7-7a2 2 0 0 1 2.8 0l6.3 6.3a2 2 0 0 1 0 2.8L11 20" />,
  pin: (
    <>
      <path d="M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10z" />
      <circle cx="12" cy="11" r="2" />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.6-3.6" />
    </>
  ),
  folder: <path d="M3 7a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  folderOpen: (
    <path d="M3 7a2 2 0 0 1 2-2h3.6l2 2H19a2 2 0 0 1 2 2v1H3zM3 10h18l-2 8a2 2 0 0 1-2 1.6H6.2A2 2 0 0 1 4.3 18z" />
  ),
};

export type IconName = keyof typeof paths;

export default function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: 'block' }}
    >
      {paths[name]}
    </svg>
  );
}
