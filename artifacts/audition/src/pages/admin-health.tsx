import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CircleHelp,
  Clock3,
  CloudCog,
  LoaderCircle,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import AuditionLogo from '@/components/audition-logo';
import {
  getGetAdminHealthQueryKey,
  useGetAdminHealth,
  useRunAdminHealthCheck,
} from '@workspace/api-client-react';
import type { ConnectionCheck, ConnectionCheckId } from '@workspace/api-client-react';

const CHECK_IDS: ConnectionCheckId[] = [
  'nebius_models',
  'nebius_text',
  'nebius_vision',
  'elevenlabs_tts',
  'elevenlabs_agent',
];

const statusText: Record<ConnectionCheck['status'], string> = {
  ok: 'Connected',
  error: 'Failed',
  missing: 'missing',
  untested: 'Not tested',
};

function readableError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = error as { message?: string; error?: string };
    return candidate.message || candidate.error || 'The request could not be completed.';
  }
  return 'The request could not be completed.';
}

function formatCheckedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function CheckDetails({ check }: { check: ConnectionCheck }) {
  return (
    <div className="check-detail" data-testid={`details-check-${check.id}`}>
      {check.configured_model !== undefined && (
        <div className="detail-line">
          <span className="detail-label">{check.model_env} · trimmed value</span>
          <code className="model-tag" data-testid={`configured-model-${check.id}`}>{check.configured_model || '(empty)'}</code>
          <div data-testid={`catalog-match-${check.id}`}>
            {check.model_in_catalog === true ? 'Exact match in the model catalog.'
              : check.model_in_catalog === false ? 'Not found in the model catalog. Check the exact ID, including case.'
              : 'Catalog membership has not been verified.'}
          </div>
          {check.model_catalog_error && <div className="error-text">{check.model_catalog_error}</div>}
        </div>
      )}
      {check.http_status != null && (
        <div className="detail-line">
          <span className="detail-label">Provider HTTP status</span>
          <code data-testid={`http-status-${check.id}`}>{check.http_status}</code>
        </div>
      )}
      {check.error && (
        <div className="detail-line">
          <span className="detail-label">Provider error</span>
          <div className="error-text" data-testid={`error-check-${check.id}`}>{check.error}</div>
        </div>
      )}
      {check.error_response_body !== undefined && (
        <div className="detail-line">
          <span className="detail-label">Full provider error response body · credentials redacted</span>
          <pre className="error-text provider-response" data-testid={`error-body-${check.id}`}>{check.error_response_body || '(empty response body)'}</pre>
        </div>
      )}
      {check.request_endpoint && (
        <details className="detail-line">
          <summary className="detail-label">Request details · no authorization headers</summary>
          <code>{check.request_method} {check.request_endpoint}</code>
          <pre className="response-box provider-response">{check.request_body}</pre>
        </details>
      )}
      {check.completion_details && (
        <div className="detail-line">
          <span className="detail-label">Completion diagnostics · also logged on the server</span>
          <pre className="response-box provider-response" data-testid={`completion-diagnostics-${check.id}`}>
            {JSON.stringify(check.completion_details, null, 2)}
          </pre>
          <div>Output source: <code>{check.output_source ?? 'none'}</code></div>
          <div>Disable-thinking parameter: {check.thinking_disabled_requested
            ? 'sent and request accepted' : 'not supported by this provider; omitted on retry'}</div>
          {check.output_source === 'reasoning_content' && (
            <div className="error-text">Health check only: using reasoning text because message.content is empty. Real scoring must require content with response_format: json_object.</div>
          )}
        </div>
      )}
      {check.thinking_parameter_error && (
        <details className="detail-line">
          <summary className="detail-label">Provider rejected the optional thinking parameter</summary>
          <pre className="error-text provider-response">{check.thinking_parameter_error}</pre>
        </details>
      )}
      {check.missing_secrets?.length > 0 && (
        <div className="detail-line">
          <span className="detail-label">Required server secrets</span>
          <div className="missing-list">
            {check.missing_secrets.map((secret) => (
              <span className="secret-tag" key={secret} data-testid={`secret-${check.id}-${secret}`}>{secret}</span>
            ))}
          </div>
        </div>
      )}
      {check.model_ids && check.model_ids.length > 0 && (
        <div className="detail-line">
          <span className="detail-label">Available model IDs · {check.model_ids.length}</span>
          <div className="model-tags">
            {check.model_ids.map((modelId, index) => (
              <span className="model-tag" key={`${modelId}-${index}`} data-testid={`model-${check.id}-${index}`}>{modelId}</span>
            ))}
          </div>
        </div>
      )}
      {check.id === 'nebius_text' && check.output && (
        <div className="detail-line">
          <span className="detail-label">Text generation response</span>
          <div className="response-box" data-testid="response-nebius-text">{check.output}</div>
        </div>
      )}
      {check.id === 'nebius_vision' && (check.image_data_url || check.output) && (
        <div className="detail-line">
          <span className="detail-label">Vision request result</span>
          <div className="vision-result">
            {check.image_data_url && (
              <img className="vision-image" src={check.image_data_url} alt="Image submitted in the vision connection test" data-testid="image-nebius-vision" />
            )}
            {check.output && <div className="vision-output" data-testid="response-nebius-vision">{check.output}</div>}
          </div>
        </div>
      )}
      {check.id === 'elevenlabs_tts' && check.output && (
        <div className="detail-line">
          <span className="detail-label">Generated sentence</span>
          <div className="response-box" data-testid="response-elevenlabs-tts">{check.output}</div>
        </div>
      )}
      {check.id === 'elevenlabs_tts' && check.audio_url && (
        <div className="detail-line">
          <span className="detail-label">Audio playback</span>
          <div className="audio-row">
            <audio controls preload="none" src={check.audio_url} data-testid="audio-elevenlabs-tts">
              Audio playback is not supported in this browser.
            </audio>
            <span className="audio-caption">Temporary diagnostic audio</span>
          </div>
        </div>
      )}
      {check.id === 'elevenlabs_agent' && check.signed_url_available !== undefined && (
        <div className="detail-line">
          <span className="detail-label">Signed URL capability</span>
          {check.signed_url_available
            ? <span className="availability" data-testid="signed-url-availability">Available · token withheld</span>
            : <span className="not-available" data-testid="signed-url-availability">Not available</span>}
        </div>
      )}
      {check.checked_at && (
        <div className="detail-line" data-testid={`checked-at-${check.id}`}>
          <span className="detail-label">Last checked</span>
          {formatCheckedAt(check.checked_at)}
        </div>
      )}
      {!check.error && !check.missing_secrets?.length && !check.model_ids?.length &&
        !(check.id === 'nebius_text' && check.output) &&
        !(check.id === 'nebius_vision' && (check.image_data_url || check.output)) &&
        !(check.id === 'elevenlabs_tts' && (check.output || check.audio_url)) &&
        !(check.id === 'elevenlabs_agent' && check.signed_url_available !== undefined) && check.checked_at && (
          <div className="detail-line">No additional diagnostic details were returned.</div>
        )}
    </div>
  );
}

export default function AdminHealthPage() {
  const queryClient = useQueryClient();
  const healthQuery = useGetAdminHealth({
    query: { queryKey: getGetAdminHealthQueryKey(), retry: false, refetchOnWindowFocus: false },
  });
  const { mutateAsync } = useRunAdminHealthCheck();
  const [pendingIds, setPendingIds] = useState<Set<ConnectionCheckId>>(() => new Set());
  const [transportErrors, setTransportErrors] = useState<Partial<Record<ConnectionCheckId, string>>>({});
  const activeRequests = useRef(new Set<ConnectionCheckId>());
  const queryKey = getGetAdminHealthQueryKey();
  const checks = healthQuery.data?.checks ?? [];
  const okayCount = checks.filter((check) => check.status === 'ok').length;
  const failedCount = checks.filter((check) => check.status === 'error').length;
  const pendingCount = pendingIds.size;

  const runCheck = async (checkId: ConnectionCheckId) => {
    if (activeRequests.current.has(checkId)) return;
    activeRequests.current.add(checkId);
    setPendingIds((current) => new Set(current).add(checkId));
    setTransportErrors((current) => {
      const next = { ...current };
      delete next[checkId];
      return next;
    });
    try {
      const result = await mutateAsync({ checkId });
      queryClient.setQueryData<{ development_only: boolean; checks: ConnectionCheck[] } | undefined>(
        queryKey,
        (current) => {
          if (!current) return { development_only: true, checks: [result] };
          const found = current.checks.some((check) => check.id === result.id);
          return {
            ...current,
            checks: found
              ? current.checks.map((check) => check.id === result.id ? result : check)
              : [...current.checks, result],
          };
        },
      );
    } catch (error) {
      setTransportErrors((current) => ({ ...current, [checkId]: readableError(error) }));
    } finally {
      activeRequests.current.delete(checkId);
      setPendingIds((current) => {
        const next = new Set(current);
        next.delete(checkId);
        return next;
      });
    }
  };

  const runAll = async () => {
    const available = CHECK_IDS.filter((id) => !activeRequests.current.has(id));
    await Promise.all(available.map((id) => runCheck(id)));
  };

  const providerTitle = (id: ConnectionCheckId) => id.startsWith('nebius') ? 'Nebius' : 'ElevenLabs';
  const providerMonogram = (id: ConnectionCheckId) => id.startsWith('nebius') ? 'N' : '11';

  return (
    <div className="diagnostics-app">
      <title>Integration diagnostics | Audition</title>
      <meta name="description" content="Check Audition provider connections and review verified integration diagnostics." />
      <div className="diagnostics-shell">
        <aside className="diag-sidebar" aria-label="Workspace">
          <div className="diag-brand">
            <AuditionLogo />
          </div>
          <div className="side-section-label">Workspace</div>
          <div className="side-nav-item active" aria-current="page"><Activity size={15} strokeWidth={1.8} /><span>Integration diagnostics</span></div>
          <div className="diag-side-bottom">
            <div className="side-env"><span className="env-dot" /><div><div className="env-title">Development environment</div><div className="env-copy">Diagnostics are available in development only.</div></div></div>
          </div>
        </aside>

        <main className="diag-workspace">
          <header className="diag-topbar">
            <div className="top-crumb">Workspace <span aria-hidden="true">/</span> <strong>Integration diagnostics</strong></div>
            <div className="workspace-label"><span className="workspace-mark">N</span> Northstar Labs</div>
          </header>

          <div className="content-wrap">
            <div className="page-heading">
              <div>
                <div className="eyebrow"><Sparkles size={12} /> Platform health</div>
                <h1 className="page-title">Integration diagnostics</h1>
                <p className="page-subtitle">Verify provider connections before you build an audition. These checks report real server-side results; they never substitute a successful response for missing configuration.</p>
              </div>
              <div className="heading-actions">
                <button
                  className="button-quiet"
                  type="button"
                  onClick={() => healthQuery.refetch()}
                  disabled={healthQuery.isFetching || pendingCount > 0}
                  data-testid="button-refresh"
                >
                  <RefreshCw size={13} className={healthQuery.isFetching ? 'spin' : ''} /> Refresh status
                </button>
                <button
                  className="button-primary"
                  type="button"
                  onClick={runAll}
                  disabled={pendingCount > 0}
                  data-testid="button-run-all"
                >
                  {pendingCount > 0 ? <LoaderCircle size={14} className="spin" /> : <Activity size={14} />}
                  {pendingCount > 0 ? `Running ${pendingCount} test${pendingCount === 1 ? '' : 's'}` : 'Run all tests'}
                </button>
              </div>
            </div>

            <div className="alert-banner alert-info" role="note">
              <LockKeyhole size={15} />
              <div><strong>Server-side credentials only.</strong> Provider keys stay on the server. Diagnostics are development-only until admin authorization is available.</div>
            </div>

            {healthQuery.isLoading && (
              <div className="check-list" aria-label="Loading connection status" data-testid="loading-health">
                {[0, 1, 2, 3].map((item) => (
                  <div className="skeleton-card" key={item}>
                    <div className="skeleton-dot" />
                    <div style={{ flex: 1, display: 'grid', gap: 8 }}>
                      <div className="skeleton-line" style={{ width: '31%' }} />
                      <div className="skeleton-line" style={{ width: '57%', height: 7 }} />
                    </div>
                    <div className="skeleton-line" style={{ width: 66 }} />
                  </div>
                ))}
              </div>
            )}

            {healthQuery.isError && (
              <div className="error-state" role="alert" data-testid="error-health-transport">
                <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
                  <AlertCircle size={16} />
                  <div style={{ flex: 1 }}><strong>Diagnostics could not be reached.</strong><br />{readableError(healthQuery.error)}<br /><button className="button-small" type="button" onClick={() => healthQuery.refetch()} data-testid="button-retry-health">Retry connection</button></div>
                </div>
              </div>
            )}

            {!healthQuery.isLoading && healthQuery.data && (
              <>
                <div className="summary-strip" data-testid="summary-health">
                  <div className="summary-lead">
                    <div className="summary-glyph"><ShieldCheck size={17} /></div>
                    <div><div className="summary-heading">Connection overview</div><div className="summary-sub">{checks.length} checks returned by the server</div></div>
                  </div>
                  <div className="summary-metric"><span className="metric-label">Connected</span><span className={`metric-value ${okayCount ? 'good' : ''}`} data-testid="count-connected">{okayCount} <span style={{ fontSize: 10, fontWeight: 500, color: '#8894a2' }}>of {checks.length}</span></span></div>
                  <div className="summary-metric"><span className="metric-label">Needs attention</span><span className={`metric-value ${failedCount ? 'bad' : ''}`} data-testid="count-failed">{failedCount}</span></div>
                  <div className="summary-metric"><span className="metric-label">Awaiting test</span><span className="metric-value" data-testid="count-untested">{checks.filter((check) => check.status === 'untested').length}</span></div>
                </div>

                <div className="section-head">
                  <div><div className="section-title">Provider connections</div><div className="section-note">Cached results are reused for 60 seconds to avoid unnecessary provider calls.</div></div>
                  <div className="cache-pill"><Clock3 size={11} /> 60-second result cache</div>
                </div>

                {checks.length > 0 ? (
                  <div className="check-list">
                    {checks.map((check, index) => {
                      const isPending = pendingIds.has(check.id);
                      const transportError = transportErrors[check.id];
                      return (
                        <article className="check-card" key={check.id} style={{ animationDelay: `${index * 45}ms` }} data-testid={`card-check-${check.id}`}>
                          <div className="check-card-head">
                            <div className={`provider-mark ${check.id.startsWith('nebius') ? 'nebius' : 'eleven'}`} aria-label={providerTitle(check.id)}>{providerMonogram(check.id)}</div>
                            <div className="check-main">
                              <div className="check-label-row">
                                <span className="check-label" data-testid={`label-check-${check.id}`}>{check.label}</span>
                                <span className="check-id">{check.id}</span>
                              </div>
                              <div className="check-message">{check.message}</div>
                            </div>
                            <div className="check-meta">
                              {check.latency_ms !== null && check.latency_ms !== undefined && <span className="latency">{check.latency_ms} ms</span>}
                              <span className={`status-chip status-${check.status}`} data-testid={`status-check-${check.id}`}>
                                {isPending ? <LoaderCircle size={11} className="spin" /> : null}
                                {isPending ? 'Testing' : statusText[check.status]}
                              </span>
                            </div>
                            <button
                              className="button-small"
                              type="button"
                              onClick={() => runCheck(check.id)}
                              disabled={isPending || pendingCount > 0}
                              data-testid={`button-test-${check.id}`}
                            >
                              {isPending ? <LoaderCircle size={12} className="spin" /> : <RefreshCw size={12} />}
                              {check.checked_at ? 'Retest' : 'Test'}
                            </button>
                          </div>
                          {transportError ? (
                            <><div className="check-divider" /><div className="check-detail">
                              <div className="alert-banner alert-error" role="alert" style={{ margin: 0 }} data-testid={`transport-error-${check.id}`}>
                                <AlertCircle size={14} /><div><strong>Test request failed.</strong> {transportError}<br /><button className="button-small" type="button" onClick={() => runCheck(check.id)} disabled={pendingCount > 0} data-testid={`button-retry-${check.id}`}>Retry this test</button></div>
                              </div>
                            </div></>
                          ) : (
                            <><div className="check-divider" /><CheckDetails check={check} /></>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="state-panel empty-state" data-testid="empty-health">
                    <CloudCog size={22} style={{ margin: '0 auto 10px', color: '#6b9b96' }} />
                    <div>No connection checks were returned.</div>
                    <div style={{ fontSize: 10, marginTop: 5 }}>Refresh status to check the diagnostics service again.</div>
                  </div>
                )}
              </>
            )}

            {healthQuery.isLoading && <div className="section-head"><div className="skeleton-line" style={{ width: 155 }} /><div className="skeleton-line" style={{ width: 130 }} /></div>}
            <div className="footer-note">
              <CircleHelp size={13} />
              <span>Running tests contacts live providers and may use provider credits. Results are cached for 60 seconds. ElevenLabs secrets are optional during setup; missing secret names are shown only when the server reports them. No secret values are displayed here.</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
