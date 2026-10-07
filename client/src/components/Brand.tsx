export default function Brand({ withName = true }: { withName?: boolean }) {
  return (
    <span className="brand">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ display: 'block' }}
      >
        {/* stylized owl */}
        <path d="M4 4c0 2.5.8 4.2 2 5.2V19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9.2c1.2-1 2-2.7 2-5.2-2 .3-3.4 1.2-4.2 2.4A9 9 0 0 0 12 6c-1.4 0-2.7.2-3.8.4C7.4 5.2 6 4.3 4 4z" />
        <circle cx="9.2" cy="12" r="1.6" />
        <circle cx="14.8" cy="12" r="1.6" />
        <path d="M12 14.5l-1 1.2h2z" />
      </svg>
      {withName && <span>Owlbear Clone</span>}
    </span>
  );
}
