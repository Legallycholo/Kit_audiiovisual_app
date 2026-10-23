import { uiLabel } from "../i18n";

/**
 * The "kit" wordmark: k red, i blue, t green. The dot of the i is the mix of
 * all three lights, ink on light surfaces and white on dark ones. With
 * `merge`, three dots drift in and blend into it (first load only).
 */
export function Wordmark({
  size = 28,
  slogan = false,
  merge = false,
  className = "",
  label = "KIT",
}: {
  size?: number;
  slogan?: boolean;
  merge?: boolean;
  className?: string;
  label?: string;
}) {
  const width = (size * 62) / 44;
  return (
    <span className={`wordmark ${merge ? "merging" : ""} ${className}`}>
      <svg
        className="wordmark-mark"
        viewBox="0 0 62 44"
        width={width}
        height={size}
        role="img"
        aria-label={label}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={7}
      >
        <path
          d="M7 5V37M22 17L9.5 27.5M14.5 23.5L23 37"
          stroke="var(--brand-red)"
        />
        <path d="M33 19V37" stroke="var(--brand-blue)" />
        <path
          d="M47 7V31.5Q47 37 52.5 37H54.5M42 18H54"
          stroke="var(--brand-green)"
        />
        {merge && (
          <g className="wordmark-lights" aria-hidden="true">
            <circle className="light r" cx="33" cy="7.5" r="4.3" />
            <circle className="light g" cx="33" cy="7.5" r="4.3" />
            <circle className="light b" cx="33" cy="7.5" r="4.3" />
          </g>
        )}
        <circle className="wordmark-dot" cx="33" cy="7.5" r="4.3" />
      </svg>
      {slogan && (
        <span className="wordmark-slogan">
          {uiLabel("la gente de los eventos")}
        </span>
      )}
    </span>
  );
}
