type StocksbrewLogoProps = {
  markSize?: number;
  className?: string;
  wordmarkClassName?: string;
};

export function StocksbrewLogo({
  markSize = 24,
  className = "",
  wordmarkClassName = "",
}: StocksbrewLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg
        aria-hidden="true"
        width={markSize}
        height={markSize}
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M38 10C26.5 10 17.4 14.8 15.6 23.3C14.1 30.1 16.8 35.8 22.2 38.2"
          stroke="currentColor"
          strokeWidth="7.5"
          strokeLinecap="round"
        />
        <path
          d="M27.3 22.4C31.2 18.2 36.9 20.8 39 26.2C42.8 36.1 35.5 45.2 24.3 46C21 46.2 18 46 14.8 45.5"
          stroke="currentColor"
          strokeWidth="7.5"
          strokeLinecap="round"
        />
      </svg>
      <span className={wordmarkClassName}>stocksbrew</span>
    </span>
  );
}
