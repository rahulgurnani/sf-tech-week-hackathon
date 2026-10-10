import { useEffect, useState } from 'react';
import { Link, useParams } from 'wouter';
import {
  AlertTriangle,
  ArrowLeft,
  BadgeCheck,
  Braces,
  Check,
  CircleHelp,
  Clock3,
  Code2,
  FileText,
  Fingerprint,
  Image as ImageIcon,
  MessageSquareText,
  RefreshCw,
  Send,
  ShieldCheck,
} from 'lucide-react';
import {
  getGetHiringReportQueryKey,
  getGetCompanyQueryKey,
  getGetReviewScreenshotUrl,
  useGetHiringReport,
  useRetryHiringReport,
  useSendCompanyCallback,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import AuditionLogo from '@/components/audition-logo';
import type { HiringReport, ReviewScore } from '@workspace/api-client-react';
import './hiring-report.css';

type ReportTab = 'scores' | 'transcript' | 'timeline' | 'integrity' | 'credential';

const tabs: { id: ReportTab; label: string; icon: typeof FileText }[] = [
  { id: 'scores', label: 'Scores', icon: BadgeCheck },
  { id: 'transcript', label: 'Transcript', icon: MessageSquareText },
  { id: 'timeline', label: 'Screen timeline', icon: ImageIcon },
  { id: 'integrity', label: 'Integrity flags', icon: Fingerprint },
  { id: 'credential', label: 'Credential', icon: ShieldCheck },
];

function formatTime(timestampMs: number) {
  const seconds = Math.floor(Math.max(0, timestampMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return mins ? `${mins}m ${remaining}s` : `${remaining}s`;
}

function displayName(name: string) {
  return name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || '—';
}

function recommendationTone(recommendation: HiringReport['recommendation']) {
  if (recommendation === 'Advance') return 'advance';
  if (recommendation === 'Hold') return 'hold';
  return 'not-now';
}

function scoreText(score: ReviewScore) {
  return score.level === 'not_covered' ? 'Not covered' : `Level ${score.level}`;
}

function ScoreRow({ score, index }: { score: ReviewScore; index: number }) {
  return (
    <article className="hr-score-row" data-testid={`score-requirement-${index}`}>
      <div className="hr-score-heading">
        <div>
          <div className="hr-kicker">Requirement {String(index + 1).padStart(2, '0')}</div>
          <h3>{score.requirement}</h3>
        </div>
        <span className={`hr-level ${score.level === 'not_covered' ? 'is-uncovered' : ''}`}>
          {scoreText(score)}
        </span>
      </div>
      <p className="hr-rationale">{score.rationale || 'No rationale was supplied for this requirement.'}</p>
      {score.needs_review && (
        <div className="hr-review-needed"><CircleHelp size={14} /> Reviewer attention suggested</div>
      )}
      {score.quotes.length > 0 ? (
        <div className="hr-evidence-list">
          {score.quotes.map((quote, quoteIndex) => (
            <blockquote className="hr-evidence-quote" key={`${quote.source}-${quote.timestamp_ms}-${quoteIndex}`}>
              <p>“{quote.quote}”</p>
              <footer>
                <span className="hr-source-tag">{quote.source === 'transcript' ? 'Transcript' : 'Code evidence'}</span>
                {quote.timestamp_ms !== null && <span className="hr-timecode">{formatTime(quote.timestamp_ms)}</span>}
                <span className={`hr-verified ${quote.verified ? 'yes' : 'no'}`}>
                  {quote.verified ? <Check size={12} /> : <CircleHelp size={12} />}
                  {quote.verified ? 'Verified' : 'Unverified'}
                </span>
              </footer>
            </blockquote>
          ))}
        </div>
      ) : (
        <div className="hr-no-evidence">No supporting quote was attached to this score.</div>
      )}
    </article>
  );
}

function ScreenshotThumbnail({ candidateId, screenshotId, token, alt }: {
  candidateId: string;
  screenshotId: string;
  token: string;
  alt: string;
}) {
  const [objectUrl, setObjectUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let createdUrl = '';
    setObjectUrl('');
    setFailed(false);
    fetch(getGetReviewScreenshotUrl(candidateId, screenshotId), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => {
        if (!response.ok) throw new Error('Screenshot unavailable');
        return response.blob();
      })
      .then((blob) => {
        if (!active) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [candidateId, screenshotId, token]);

  if (failed) {
    return <div className="hr-thumb-unavailable"><ImageIcon size={18} /><span>Private image unavailable</span></div>;
  }
  if (!objectUrl) {
    return <div className="hr-thumb-loading" aria-label="Loading private screenshot"><span /></div>;
  }
  return <img className="hr-thumbnail" src={objectUrl} alt={alt} />;
}

function ScoresView({ report }: { report: HiringReport }) {
  return (
    <div className="hr-view-stack">
      <section className="hr-summary-grid" aria-label="Reviewer summary">
        <div className="hr-recommendation-card">
          <div className="hr-card-overline"><span className="hr-live-dot" /> Human reviewer recommendation</div>
          <div className="hr-recommendation-line">
            <span className={`hr-recommendation ${recommendationTone(report.recommendation)}`}>
              {report.recommendation ?? (report.status === 'pending' || report.status === 'scoring' ? 'Scoring…' : 'Not available')}
            </span>
            <span className="hr-human-label">For reviewer consideration</span>
          </div>
          <p className="hr-reasoning">
            {report.reasoning || 'No recommendation reasoning was supplied in this report.'}
          </p>
          <p className="hr-disclaimer">This is evidence to support a human review—not an automated hiring verdict.</p>
        </div>
        <div className="hr-overall-card">
          <div className="hr-card-overline">Evidence score</div>
          <div className="hr-overall-number">
            {report.overall_score === null ? '—' : report.overall_score.toFixed(1)}
            <span>/ 4</span>
          </div>
          <div className="hr-score-caption">{report.scores.filter(s => typeof s.level === 'number' && !s.needs_review).length} of {report.scores.length} requirements scored; unverified and not covered excluded</div>
          <div className="hr-score-scale" aria-label={report.overall_score === null ? 'Score not available' : `Overall score ${report.overall_score} out of 4`}>
            {[1, 2, 3, 4].map((level) => <span className={report.overall_score !== null && report.overall_score >= level ? 'filled' : ''} key={level} />)}
          </div>
        </div>
      </section>
      <div className="hr-section-heading">
        <div><div className="hr-kicker">Evidence by requirement</div><h2>What the candidate showed</h2></div>
        <span className="hr-count">{report.scores.length} requirements</span>
      </div>
      {report.scores.length ? (
        <div className="hr-score-list">{report.scores.map((score, index) => <ScoreRow key={`${score.requirement}-${index}`} score={score} index={index} />)}</div>
      ) : (
        <div className="hr-empty-panel"><FileText size={20} /><strong>No requirement scores yet</strong><span>Scores will appear here when evidence is available.</span></div>
      )}
      <section className="hr-code-card">
        <div className="hr-code-head">
          <div><div className="hr-kicker">Submitted work</div><h2><Code2 size={16} /> Final code</h2></div>
          <span className="hr-code-lang"><Braces size={13} /> Candidate submission</span>
        </div>
        {report.final_code ? (
          <pre className="hr-code"><code>{report.final_code}</code></pre>
        ) : (
          <div className="hr-no-code">No final code was captured for this audition.</div>
        )}
      </section>
    </div>
  );
}

function TranscriptView({ report }: { report: HiringReport }) {
  if (!report.transcript.length) {
    return <div className="hr-empty-panel"><MessageSquareText size={20} /><strong>No transcript available</strong><span>The complete conversation transcript was not returned with this report.</span></div>;
  }
  return (
    <div className="hr-transcript">
      <div className="hr-transcript-intro"><div><div className="hr-kicker">Conversation record</div><h2>Full transcript</h2></div><span>{report.transcript.length} entries</span></div>
      {report.transcript.map((entry) => (
        <article className={`hr-transcript-entry ${entry.speaker === 'candidate' ? 'candidate' : 'interviewer'} ${entry.is_app_message ? 'app-message' : ''}`} key={entry.id}>
          <div className="hr-transcript-meta">
            <span className={`hr-speaker-dot ${entry.speaker}`} />
            <strong>{entry.is_app_message ? 'Audition' : entry.speaker === 'candidate' ? report.candidate.name : 'Interviewer'}</strong>
            {entry.is_app_message && <span className="hr-app-message-label">App message</span>}
            <span className="hr-timecode">{formatTime(entry.timestamp_ms)}</span>
          </div>
          <p>{entry.text}</p>
          <span className="hr-transcript-origin">{entry.origin === 'app' ? 'Audition platform' : 'Conversation transcript'}</span>
        </article>
      ))}
    </div>
  );
}

function TimelineView({ report, candidateId, token }: { report: HiringReport; candidateId: string; token: string }) {
  if (!report.timeline.length) {
    return <div className="hr-empty-panel"><ImageIcon size={20} /><strong>No screen timeline</strong><span>There are no captured screen moments in this report.</span></div>;
  }
  return (
    <div className="hr-timeline">
      <div className="hr-transcript-intro"><div><div className="hr-kicker">Observed work session</div><h2>Screen timeline</h2></div><span>{report.timeline.length} moments</span></div>
      <div className="hr-timeline-list">
        {report.timeline.map((item, index) => (
          <article className="hr-timeline-item" key={`${item.screenshot_id}-${item.timestamp_ms}`}>
            <div className="hr-timeline-rail"><span>{String(index + 1).padStart(2, '0')}</span><i /></div>
            <div className="hr-timeline-content">
              <div className="hr-timeline-caption"><span className="hr-timecode">{formatTime(item.timestamp_ms)}</span><p>{item.description}</p></div>
              <div className="hr-private-frame">
                <ScreenshotThumbnail candidateId={candidateId} screenshotId={item.screenshot_id} token={token} alt={`Private screen capture at ${formatTime(item.timestamp_ms)}`} />
                <span className="hr-private-label"><ShieldCheck size={12} /> Private evidence</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function IntegrityView({ report }: { report: HiringReport }) {
  if (!report.integrity_flags.length) {
    return <div className="hr-empty-panel"><ShieldCheck size={20} /><strong>No integrity flags recorded</strong><span>This is a record of observed events only. It does not alter requirement scores.</span></div>;
  }
  return (
    <div className="hr-integrity-view">
      <div className="hr-integrity-intro"><div className="hr-integrity-symbol"><Fingerprint size={19} /></div><div><div className="hr-kicker">Separate from evaluation</div><h2>Integrity flags</h2><p>These events are shown as context only and never change the candidate’s scores.</p></div></div>
      <div className="hr-integrity-list">
        {report.integrity_flags.map((flag) => (
          <article className="hr-integrity-row" key={flag.id}>
            <div className="hr-integrity-mark"><AlertTriangle size={15} /></div>
            <div className="hr-integrity-copy"><div className="hr-integrity-title">{flag.type.replaceAll('_', ' ')}</div><p>{Object.keys(flag.details).length ? Object.entries(flag.details).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`).join(' · ') : 'No additional event details were supplied.'}</p></div>
            <span className="hr-timecode">{formatTime(flag.timestamp_ms)}</span>
          </article>
        ))}
      </div>
    </div>
  );
}

function CredentialView() {
  return (
    <div className="hr-credential">
      <div className="hr-credential-illustration"><ShieldCheck size={28} strokeWidth={1.4} /></div>
      <div className="hr-kicker">Verified record</div>
      <h2>No credential issued</h2>
      <p>There is no candidate credential associated with this audition. Audition has not issued a credential for this report.</p>
      <span className="hr-credential-state"><span /> Not issued</span>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="hr-skeleton-layout" aria-label="Loading report">
      <div className="hr-skeleton-summary"><span /><span /></div>
      {[0, 1, 2].map((item) => <div className="hr-skeleton-row" key={item}><span /><div><i /><i /><i /></div></div>)}
    </div>
  );
}

export default function HiringReportPage() {
  const { candidateId = '' } = useParams<{ candidateId: string }>();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ReportTab>('scores');
  const [callbackMarked, setCallbackMarked] = useState(false);
  const token = new URLSearchParams(window.location.search).get('company') ?? '';
  const tokenValid = /^[a-fA-F0-9]{64}$/.test(token);
  const authRequest = { headers: { Authorization: `Bearer ${token}` } };
  const reportQuery = useGetHiringReport(candidateId, {
    query: { queryKey: getGetHiringReportQueryKey(candidateId), refetchInterval: 3000, enabled: tokenValid },
    request: authRequest,
  });
  const retryReport = useRetryHiringReport({ request: authRequest });
  const sendCallback = useSendCompanyCallback({ request: authRequest });
  const report = reportQuery.data;

  useEffect(() => {
    if (retryReport.isSuccess) {
      void queryClient.invalidateQueries({ queryKey: getGetHiringReportQueryKey(candidateId) });
    }
  }, [retryReport.isSuccess, candidateId, queryClient]);

  const retry = () => retryReport.mutate({ candidateId });
  const callback = () => sendCallback.mutate({ token, candidateId }, {
    onSuccess: (result) => {
      setCallbackMarked(result.marked);
      void queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(token) });
      if (result.mailto) window.location.href = result.mailto;
    },
  });
  const companyHref = tokenValid ? `/company/${token}` : '/';
  const errorMessage = reportQuery.error instanceof Error ? reportQuery.error.message : 'We could not retrieve this report.';

  return (
    <main className="hr-app">
      <header className="hr-topbar">
        <div className="hr-topbar-inner">
          <Link href={companyHref} className="hr-back-link" data-testid="link-back-company"><ArrowLeft size={16} /> Back to company</Link>
          <AuditionLogo className="hr-brand" />
          <div className="hr-secure-note"><ShieldCheck size={14} /> Confidential candidate evidence</div>
        </div>
      </header>
      <div className="hr-page">
        {!tokenValid ? (
          <section className="hr-access-error">
            <div className="hr-error-icon"><ShieldCheck size={22} /></div>
            <div className="hr-kicker">Company access required</div>
            <h1>This report needs a company link</h1>
            <p>Open the report using the private company link provided for this audition. The access token is never displayed in the report.</p>
            <Link href="/" className="hr-button-secondary" data-testid="link-return-home"><ArrowLeft size={15} /> Return to Audition</Link>
          </section>
        ) : reportQuery.isLoading ? (
          <>
            <div className="hr-page-heading"><div className="hr-kicker">Candidate review</div><h1>Loading candidate evidence</h1></div>
            <ReportSkeleton />
          </>
        ) : reportQuery.isError ? (
          <section className="hr-fetch-error">
            <div className="hr-error-icon"><AlertTriangle size={20} /></div>
            <div className="hr-kicker">Report unavailable</div>
            <h1>We couldn’t load this candidate report</h1>
            <p>{errorMessage}</p>
            {retryReport.isError && <p className="hr-retry-error">{retryReport.error instanceof Error ? retryReport.error.message : 'Retry could not be queued.'}</p>}
            <button className="hr-button-primary" onClick={retry} disabled={retryReport.isPending} data-testid="button-retry-report">
              <RefreshCw size={15} className={retryReport.isPending ? 'hr-spin' : ''} />
              {retryReport.isPending ? 'Requesting retry…' : 'Retry report'}
            </button>
          </section>
        ) : report ? (
          <>
            <div className="hr-breadcrumb"><Link href={companyHref} data-testid="link-company-breadcrumb">{report.company}</Link><span>/</span><span>Candidate report</span></div>
            <section className="hr-candidate-header">
              <div className="hr-candidate-primary">
                <div className="hr-avatar" aria-hidden="true">{displayName(report.candidate.name)}</div>
                <div>
                  <div className="hr-kicker">{report.company} <span className="hr-kicker-divider">/</span> {report.role}</div>
                  <h1 data-testid="text-candidate-name">{report.candidate.name}</h1>
                  <div className="hr-candidate-meta"><span>{report.candidate.email}</span><span className="hr-meta-separator" /><span>ID {report.candidate.id}</span></div>
                </div>
              </div>
              <div className="hr-session-meta">
                <span className={`hr-report-status ${report.status}`}><i />{report.status === 'ready' ? 'Report ready' : report.status === 'error' ? 'Scoring error' : 'Scoring…'}</span>
                <span className="hr-duration"><Clock3 size={14} /> {formatDuration(report.duration_seconds)} session</span>
                {tokenValid && <button className="hr-button-secondary" onClick={callback} disabled={sendCallback.isPending || callbackMarked} title="Marks this candidate for callback and opens a prefilled email. It is not sent automatically." data-testid="button-send-callback">
                  <Send size={13} />{sendCallback.isPending ? 'Preparing…' : callbackMarked ? 'Callback marked' : 'Send callback'}
                </button>}
              </div>
            </section>
            {sendCallback.isError && <div className="hr-alert hr-alert-error" role="alert"><AlertTriangle size={16} /><div><strong>Callback could not be prepared</strong><p>{sendCallback.error instanceof Error ? sendCallback.error.message : 'Please try again.'}</p></div></div>}

            {report.status === 'error' && (
              <div className="hr-alert hr-alert-error" role="alert">
                <AlertTriangle size={17} />
                <div><strong>Scoring could not be completed</strong><p>{report.error || 'The report provider returned an error. You can request another scoring attempt.'}</p></div>
                <button onClick={retry} disabled={retryReport.isPending} className="hr-alert-retry" data-testid="button-retry-report">
                  <RefreshCw size={14} className={retryReport.isPending ? 'hr-spin' : ''} /> {retryReport.isPending ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            )}
            {retryReport.isError && report.status === 'error' && (
              <div className="hr-retry-error" role="alert">{retryReport.error instanceof Error ? retryReport.error.message : 'Retry could not be queued.'}</div>
            )}
            {report.status !== 'error' && report.status !== 'ready' && (
              <div className="hr-alert hr-alert-progress"><RefreshCw size={16} className="hr-spin" /><div><strong>Scoring in progress</strong><p>This report updates automatically as evidence is analysed. Latest check every 3 seconds.</p></div></div>
            )}
            {report.transcript_missing && (
              <div className="hr-alert hr-alert-warning"><MessageSquareText size={16} /><div><strong>Transcript unavailable</strong><p>A full conversation transcript was not available for this report.</p></div></div>
            )}
            {report.vision_error && (
              <div className="hr-alert hr-alert-warning"><ImageIcon size={16} /><div><strong>Screen analysis unavailable</strong><p>{report.vision_error}</p></div></div>
            )}

            <nav className="hr-tabs" aria-label="Candidate report sections">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button key={id} className={`hr-tab ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)} aria-current={activeTab === id ? 'page' : undefined} data-testid={`tab-${id}`}>
                  <Icon size={15} /><span>{label}</span>
                  {id === 'integrity' && report.integrity_flags.length > 0 && <span className="hr-tab-count">{report.integrity_flags.length}</span>}
                </button>
              ))}
            </nav>
            <section className="hr-tab-content" aria-live="polite">
              {activeTab === 'scores' && <ScoresView report={report} />}
              {activeTab === 'transcript' && <TranscriptView report={report} />}
              {activeTab === 'timeline' && <TimelineView report={report} candidateId={candidateId} token={token} />}
              {activeTab === 'integrity' && <IntegrityView report={report} />}
              {activeTab === 'credential' && <CredentialView />}
            </section>
            <footer className="hr-footer"><ShieldCheck size={14} /><span>Audition provides technical evidence to inform your decision. Hiring decisions remain with your team.</span></footer>
          </>
        ) : null}
      </div>
    </main>
  );
}
