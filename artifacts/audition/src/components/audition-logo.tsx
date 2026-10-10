import "./audition-logo.css";

type AuditionLogoProps = {
  className?: string;
};

export default function AuditionLogo({ className = "" }: AuditionLogoProps) {
  return (
    <div className={`audition-logo ${className}`.trim()} aria-label="Audition — Fair skill signals">
      <span className="audition-logo-mark" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" fill="none">
          <rect width="40" height="40" rx="11" fill="#0F2E3A" />
          <g strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2">
            <path d="M7.5 17.5v5" stroke="#9FD9CD" />
            <path d="M13 12.5v15" stroke="#E9F5F2" />
            <path d="M18.5 15.5v9" stroke="#E9F5F2" />
            <path d="M23 20.5l3.5 3.5 6-9.5" stroke="#3FD1B0" />
          </g>
        </svg>
      </span>
      <span className="audition-logo-copy">
        <span className="audition-logo-wordmark">Audition</span>
        <span className="audition-logo-tagline">Fair skill signals</span>
      </span>
    </div>
  );
}
