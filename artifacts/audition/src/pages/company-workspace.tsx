import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useLocation } from 'wouter';
import { AlertTriangle, ArrowDownRight, Check, CheckCircle2, Clipboard, Clock3, FileText, LockKeyhole, Plus, RefreshCw, Send, ShieldCheck, Sparkles, Users } from 'lucide-react';
import {
  getGetCompanyQueryKey,
  useApproveCompanyQuestions,
  useDraftCompanyQuestions,
  useGetCompany,
  useInviteCompanyCandidate,
  useSendCompanyCallback,
  type CompanyWorkspace,
  type CompanyWorkspaceCandidatesItem,
  type QuestionDraft,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import AuditionLogo from '@/components/audition-logo';

type LocalInvite = { id: string; name: string; email: string; invite_path: string };

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function candidateStatusClass(status: string) {
  if (status === 'Ready') return 'ready';
  if (status === 'Scoring') return 'scoring';
  if (status === 'In progress') return 'in-progress';
  return '';
}

function privateLink(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path.startsWith('/') ? path : `/${path}`, window.location.origin).toString();
}

function reportLink(path: string, token: string) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set('company', token);
  return `${url.pathname}${url.search}${url.hash}`;
}

function dateLabel(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function CandidateTable({ candidates, token, onCallback, callbackPending, onCopy, copiedPath, showOnlyCallbacks = false }: {
  candidates: CompanyWorkspaceCandidatesItem[];
  token: string;
  onCallback: (candidateId: string) => void;
  callbackPending: boolean;
  onCopy: (path: string) => void;
  copiedPath: string;
  showOnlyCallbacks?: boolean;
}) {
  const rows = candidates.filter(candidate => !showOnlyCallbacks || Boolean(candidate.report_path))
    .slice().sort((left, right) => Number(Boolean(right.report_path)) - Number(Boolean(left.report_path)) ||
      (right.score ?? -1) - (left.score ?? -1) || left.name.localeCompare(right.name));
  if (!rows.length) {
    return <div className="candidate-empty"><Users size={23} style={{ margin: '0 auto 12px', color: '#9aa9ae' }} /><strong>{showOnlyCallbacks ? 'No finished auditions yet' : 'No candidates invited yet'}</strong>{showOnlyCallbacks ? 'Finished candidates appear here with their recommendation. Send callback is available when their report is ready.' : 'Once the questions are approved, invite candidates to complete the same short audition.'}</div>;
  }
  return (
    <table className="candidate-table">
      <thead><tr><th>Candidate</th><th>Status</th><th>Recommendation</th><th>Overall score</th><th>Integrity flags</th><th>{showOnlyCallbacks ? 'Callback' : 'Invite / review'}</th></tr></thead>
      <tbody>
        {rows.map((candidate) => (
          <tr key={candidate.id} data-testid={`row-candidate-${candidate.id}`}>
            <td>
              <div className="candidate-name">{candidate.name}</div>
              <div className="candidate-email">{candidate.email}</div>
              {candidate.invite_path && !candidate.report_path && <div className="company-invite-link" data-testid={`invite-link-${candidate.id}`}>{privateLink(candidate.invite_path)}</div>}
            </td>
            <td><span className={`company-status ${candidateStatusClass(candidate.status)}`}>{candidate.status}</span>{candidate.scoring_error && <div className="company-card-note" style={{ color: '#ae4b46', maxWidth: 220, marginTop: 6 }} data-testid={`error-scoring-${candidate.id}`}>{candidate.scoring_error}</div>}</td>
            <td>
              {candidate.recommendation ?? (candidate.status === 'Scoring' ? 'Scoring…' : '—')}
            </td>
            <td>
              {candidate.score === null ? <span style={{ color: '#98a5aa' }}>—</span> : <strong style={{ color: '#2b635a', fontVariantNumeric: 'tabular-nums' }}>{candidate.score.toFixed(2)} / 4</strong>}
              {candidate.callback_at && <span className="company-callback-date" data-testid={`callback-date-${candidate.id}`}><CheckCircle2 size={12} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 4 }} />Marked {dateLabel(candidate.callback_at)}</span>}
            </td>
            <td>{candidate.integrity_flags_count ?? 0}</td>
            <td>
              <div className="candidate-actions">
                {candidate.report_path && <Link href={reportLink(candidate.report_path, token)} className="company-btn compact" data-testid={`link-report-${candidate.id}`}><FileText size={13} />Report</Link>}
                {!candidate.report_path && candidate.invite_path && <button type="button" className="company-btn compact" onClick={() => onCopy(candidate.invite_path)} data-testid={`button-copy-invite-${candidate.id}`}><Clipboard size={13} />{copiedPath === candidate.invite_path ? 'Copied' : 'Copy invite link'}</button>}
                {candidate.callback_at ? <span className="company-status approved">Callback marked</span> : candidate.status === 'Ready' && (
                  <button type="button" className="company-btn compact" disabled={callbackPending || candidate.status !== 'Ready'} onClick={() => onCallback(candidate.id)} title={candidate.status !== 'Ready' ? 'Available when scoring is ready' : 'Mark this candidate for a human callback'} data-testid={`button-callback-${candidate.id}`}><ArrowDownRight size={13} />{callbackPending ? 'Preparing…' : 'Send callback'}</button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LoadingWorkspace() {
  return <div className="company-card company-card-body company-skeleton" aria-label="Loading company workspace"><div className="company-skeleton-line" style={{ width: '36%' }} /><div className="company-skeleton-line" style={{ width: '70%', height: 28, marginTop: 9 }} /><div className="company-skeleton-line" style={{ width: '92%', marginTop: 9 }} /><div className="company-skeleton-line" style={{ width: '100%', height: 130, marginTop: 22 }} /></div>;
}

export default function CompanyWorkspacePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [location] = useLocation();
  const callbacksView = location.endsWith('/callbacks');
  const queryClient = useQueryClient();
  const authRequest = useMemo(() => ({ headers: { Authorization: `Bearer ${token}` } }), [token]);
  const companyQuery = useGetCompany(token, {
    query: { queryKey: getGetCompanyQueryKey(token), refetchInterval: 5000, enabled: Boolean(token) },
    request: authRequest,
  });
  const generateOrSave = useDraftCompanyQuestions({ request: authRequest });
  const approveQuestions = useApproveCompanyQuestions({ request: authRequest });
  const inviteCandidate = useInviteCompanyCandidate({ request: authRequest });
  const sendCallback = useSendCompanyCallback({ request: authRequest });
  const workspace = companyQuery.data as CompanyWorkspace | undefined;
  const [draft, setDraft] = useState<QuestionDraft | null>(null);
  const initializedForToken = useRef('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [localInvite, setLocalInvite] = useState<LocalInvite | null>(null);
  const [copiedPath, setCopiedPath] = useState('');
  const [copiedCompany, setCopiedCompany] = useState(false);
  const [copyError, setCopyError] = useState('');

  useEffect(() => {
    if (!workspace || initializedForToken.current === token) return;
    initializedForToken.current = token;
    setDraft(workspace.draft ? structuredClone(workspace.draft) : null);
  }, [workspace, token]);

  const candidates = useMemo(() => {
    const list = workspace?.candidates ?? [];
    if (!localInvite || list.some((candidate) => candidate.id === localInvite.id)) return list;
    return [{
      id: localInvite.id,
      name: localInvite.name,
      email: localInvite.email,
      status: 'Invited',
      score: null,
      recommendation: null,
      integrity_flags_count: 0,
      scoring_error: null,
      callback_at: null,
      invite_path: localInvite.invite_path,
      report_path: null,
    } as CompanyWorkspaceCandidatesItem, ...list];
  }, [workspace?.candidates, localInvite]);

  const invalidateWorkspace = () => queryClient.invalidateQueries({ queryKey: getGetCompanyQueryKey(token) });
  const copy = async (path: string, companyLink = false) => {
    setCopyError('');
    try {
      await navigator.clipboard.writeText(companyLink ? `${window.location.origin}/company/${token}` : privateLink(path));
      setCopiedPath(companyLink ? '' : path);
      setCopiedCompany(companyLink);
      window.setTimeout(() => { setCopiedPath(''); setCopiedCompany(false); }, 2400);
    } catch {
      setCopyError('Clipboard access is unavailable in this browser. Copy the link from the address field if needed.');
    }
  };

  const handleGenerate = () => {
    generateOrSave.mutate({ token, data: {} }, {
      onSuccess: (nextDraft) => {
        setDraft(nextDraft);
        void invalidateWorkspace();
      },
      onError: () => void invalidateWorkspace(),
    });
  };

  const handleSave = () => {
    if (!draft) return;
    generateOrSave.mutate({ token, data: { draft } }, { onSuccess: () => void invalidateWorkspace() });
  };

  const handleApprove = () => {
    if (!draft) return;
    const approved = window.confirm('Approve and freeze these questions? This is irreversible. Once approved, candidates will receive this exact audition and the questions cannot be edited.');
    if (!approved) return;
    approveQuestions.mutate({ token, data: { draft } }, { onSuccess: () => void invalidateWorkspace() });
  };

  const handleInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!workspace || workspace.approval_status !== 'approved') return;
    const name = candidateName.trim();
    const email = candidateEmail.trim();
    inviteCandidate.mutate({ token, data: { name, email } }, {
      onSuccess: (result) => {
        setLocalInvite({ id: result.id, name, email, invite_path: result.invite_path });
        setCandidateName('');
        setCandidateEmail('');
        setInviteOpen(false);
        void invalidateWorkspace();
      },
    });
  };

  const handleCallback = (candidateId: string) => {
    sendCallback.mutate({ token, candidateId }, {
      onSuccess: (result) => {
        void invalidateWorkspace();
        if (result.mailto) window.location.href = result.mailto;
      },
    });
  };

  const companyHref = `/company/${token}`;
  const error = companyQuery.error ? errorMessage(companyQuery.error, 'We could not load this company workspace.') : '';
  const draftError = generateOrSave.error ? errorMessage(generateOrSave.error, 'The question draft could not be updated.') : '';
  const approvalError = approveQuestions.error ? errorMessage(approveQuestions.error, 'The question set could not be approved.') : '';
  const inviteError = inviteCandidate.error ? errorMessage(inviteCandidate.error, 'The invitation could not be created.') : '';
  const callbackError = sendCallback.error ? errorMessage(sendCallback.error, 'The callback could not be prepared.') : '';
  const isApproved = workspace?.approval_status === 'approved';

  return (
    <main className="company-app">
      <header className="company-topbar">
        <div className="company-topbar-inner">
          <Link href={companyHref} className="company-brand-link" aria-label="Audition company workspace"><AuditionLogo className="light-header" /></Link>
          <nav className="company-nav" aria-label="Company workspace">
            <Link href={companyHref} className={!callbacksView ? 'active' : ''} data-testid="link-workspace">Workspace</Link>
            <Link href={`${companyHref}/callbacks`} className={callbacksView ? 'active' : ''} data-testid="link-callbacks">Callbacks</Link>
          </nav>
        </div>
      </header>
      <div className="company-content">
        {companyQuery.isLoading && <LoadingWorkspace />}
        {companyQuery.isError && (
          <section className="company-error" role="alert">
            <strong>Company workspace unavailable</strong><br />{error}
            <div style={{ marginTop: 12 }}><button className="company-btn compact" onClick={() => void companyQuery.refetch()} disabled={companyQuery.isFetching} data-testid="button-retry-company"><RefreshCw size={13} />Try again</button></div>
          </section>
        )}
        {!companyQuery.isLoading && !companyQuery.isError && workspace && (
          <>
            <div className="company-heading">
              <div>
                <div className="company-kicker">{callbacksView ? 'Human review' : 'Hiring workspace'} <span style={{ color: '#b0bdc1', margin: '0 5px' }}>/</span> {workspace.company}</div>
                <h1 className="company-title">{callbacksView ? 'Callbacks' : workspace.role}</h1>
                <p className="company-subtitle">{callbacksView ? 'All finished auditions, highest score first. Review the recommendation, then choose who to invite to a human interview.' : `A consistent, ${Math.round(workspace.duration_seconds / 60)}-minute audition for every candidate. Review the question set first, then invite your shortlist.`}</p>
              </div>
              <span className={`company-status ${isApproved ? 'approved' : ''}`} data-testid="status-approval">{isApproved ? 'Questions approved' : 'Draft in progress'}</span>
            </div>

            {callbacksView ? (
              <>
                <div className="company-metrics">
                  <div className="company-metric"><div className="company-metric-label">Finished auditions</div><div className="company-metric-value">{candidates.filter(candidate => Boolean(candidate.report_path)).length}</div><div className="company-metric-caption">Available for human review</div></div>
                  <div className="company-metric"><div className="company-metric-label">Ready for review</div><div className="company-metric-value">{candidates.filter((candidate) => candidate.status === 'Ready').length}</div><div className="company-metric-caption">Evidence reports available</div></div>
                  <div className="company-metric"><div className="company-metric-label">Callbacks marked</div><div className="company-metric-value">{candidates.filter((candidate) => Boolean(candidate.callback_at)).length}</div><div className="company-metric-caption">Human follow-up requested</div></div>
                </div>
                <section className="company-card">
                  <div className="company-card-head"><div><h2 className="company-card-title">Candidate decisions</h2><p className="company-card-note">Callback email drafts open in your mail app. Nothing is sent automatically.</p></div><span className="company-status">{candidates.filter((candidate) => candidate.callback_at).length} marked</span></div>
                  <div className="company-card-body" style={{ paddingTop: 12 }}>
                    {callbackError && <div className="company-error" role="alert" style={{ marginBottom: 13 }}>{callbackError}</div>}
                    {copyError && <div className="company-error" role="alert" style={{ marginBottom: 13 }}>{copyError}</div>}
                    <CandidateTable candidates={candidates} token={token} onCallback={handleCallback} callbackPending={sendCallback.isPending} onCopy={(path) => void copy(path)} copiedPath={copiedPath} showOnlyCallbacks />
                  </div>
                </section>
                <div className="company-note" style={{ marginTop: 16 }}><ShieldCheck size={14} style={{ display: 'inline', verticalAlign: '-3px', marginRight: 6 }} />Recommendations and evidence are decision support only. Callbacks are selected by your hiring team.</div>
              </>
            ) : (
              <>
                <div className="company-metrics">
                  <div className="company-metric"><div className="company-metric-label">Audition length</div><div className="company-metric-value">{Math.floor(workspace.duration_seconds / 60)}<span style={{ fontSize: 12, marginLeft: 4 }}>min</span></div><div className="company-metric-caption">One behavioral and one technical task</div></div>
                  <div className="company-metric"><div className="company-metric-label">Candidates</div><div className="company-metric-value">{candidates.length}</div><div className="company-metric-caption">Same approved questions for all</div></div>
                  <div className="company-metric"><div className="company-metric-label">Snapshot</div><div className="company-metric-value" style={{ fontSize: 14 }}>{workspace.snapshot_hash ? workspace.snapshot_hash.slice(0, 12) : 'Not frozen'}</div><div className="company-metric-caption">{workspace.approved_at ? `Approved ${dateLabel(workspace.approved_at)}` : 'Approval locks the question set'}</div></div>
                </div>

                <section className="company-card">
                  <div className="company-card-head">
                    <div><h2 className="company-card-title">Audition questions</h2><p className="company-card-note">One behavioral question and one technical task, each designed to fit within a minute.</p></div>
                    {isApproved && <span className="company-status approved"><LockKeyhole size={12} /> Frozen</span>}
                  </div>
                  <div className="company-card-body">
                    {isApproved ? (
                      workspace.draft ? <ReadOnlyQuestions draft={workspace.draft} /> : <div className="company-error">Approved question set was not included in the workspace response.</div>
                    ) : !draft ? (
                      <div className="candidate-empty" style={{ padding: '30px 18px' }}>
                        <Sparkles size={21} style={{ margin: '0 auto 10px', color: '#45988b' }} /><strong>Prepare a role-specific question set</strong>
                        Questions are generated from the role and job description. Review and edit each prompt before approval.
                        {draftError && <div className="company-error" role="alert" style={{ margin: '13px auto', maxWidth: 470 }}>{draftError}</div>}
                        <button className="company-btn primary" style={{ marginTop: 15 }} onClick={handleGenerate} disabled={generateOrSave.isPending} data-testid="button-generate-questions"><Sparkles size={14} />{generateOrSave.isPending ? 'Generating questions…' : 'Generate question draft'}</button>
                      </div>
                    ) : (
                      <>
                        {draftError && <div className="company-error" role="alert" style={{ marginBottom: 15 }}>{draftError}</div>}
                        <QuestionEditor draft={draft} setDraft={setDraft} />
                        <div className="company-note" style={{ marginTop: 14 }}><LockKeyhole size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} /><strong>Scoring reference — private.</strong> Reference notes are visible only to your team. They are not sent to the candidate or voice interviewer.</div>
                        {approvalError && <div className="company-error" role="alert" style={{ marginTop: 12 }}>{approvalError}</div>}
                        <div className="company-form-actions" style={{ marginTop: 16, justifyContent: 'space-between' }}>
                          <button className="company-btn" onClick={handleGenerate} disabled={generateOrSave.isPending || approveQuestions.isPending} data-testid="button-regenerate-questions"><RefreshCw size={13} />Regenerate</button>
                          <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            <button className="company-btn" onClick={handleSave} disabled={generateOrSave.isPending || approveQuestions.isPending} data-testid="button-save-draft">{generateOrSave.isPending ? 'Saving…' : 'Save draft'}</button>
                            <button className="company-btn primary" onClick={handleApprove} disabled={approveQuestions.isPending || generateOrSave.isPending || !draft.behavioral.prompt.trim() || !draft.technical.prompt.trim()} data-testid="button-approve-questions">{approveQuestions.isPending ? 'Freezing questions…' : 'Approve & freeze'} <Check size={14} /></button>
                          </div>
                        </div>
                        <p className="company-card-note" style={{ textAlign: 'right', marginTop: 9 }}>Approval is irreversible. This exact snapshot is used for every candidate.</p>
                      </>
                    )}
                  </div>
                </section>

                <section className="company-card company-section">
                  <div className="company-card-head">
                    <div><h2 className="company-card-title">Candidates</h2><p className="company-card-note">Invite one person at a time. Each link is private and single-use.</p></div>
                    <button className="company-btn primary" onClick={() => setInviteOpen((open) => !open)} disabled={!isApproved} title={!isApproved ? 'Approve the question set before inviting candidates' : ''} data-testid="button-invite-candidate"><Plus size={14} />Invite candidate</button>
                  </div>
                  <div className="company-card-body" style={{ paddingTop: 14 }}>
                    {!isApproved && <div className="company-note" style={{ marginBottom: 15 }}><LockKeyhole size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Approve and freeze questions before creating any candidate invitation.</div>}
                    {inviteOpen && isApproved && (
                      <form className="company-form" onSubmit={handleInvite} style={{ padding: 15, marginBottom: 17, border: '1px solid #e6edef', borderRadius: 8, background: '#fafcfc' }}>
                        <div className="company-form-grid">
                          <div className="company-field"><label htmlFor="candidate-name">Candidate name</label><input id="candidate-name" required maxLength={120} value={candidateName} onChange={(event) => setCandidateName(event.target.value)} placeholder="Your name" data-testid="input-candidate-name" /></div>
                          <div className="company-field"><label htmlFor="candidate-email">Candidate email</label><input id="candidate-email" required type="email" value={candidateEmail} onChange={(event) => setCandidateEmail(event.target.value)} placeholder="name@example.com" data-testid="input-candidate-email" /></div>
                        </div>
                        {inviteError && <div className="company-error" role="alert">{inviteError}</div>}
                        <div className="company-form-actions">
                          <button type="button" className="company-btn" onClick={() => setInviteOpen(false)} data-testid="button-cancel-invite">Cancel</button>
                          <button type="submit" className="company-btn primary" disabled={inviteCandidate.isPending} data-testid="button-send-invite"><Send size={13} />{inviteCandidate.isPending ? 'Creating invite…' : 'Create single-use link'}</button>
                        </div>
                      </form>
                    )}
                    {callbackError && <div className="company-error" role="alert" style={{ marginBottom: 13 }}>{callbackError}</div>}
                    {copyError && <div className="company-error" role="alert" style={{ marginBottom: 13 }}>{copyError}</div>}
                    <CandidateTable candidates={candidates} token={token} onCallback={handleCallback} callbackPending={sendCallback.isPending} onCopy={(path) => void copy(path)} copiedPath={copiedPath} />
                    <div className="company-warning" style={{ marginTop: 16 }}><AlertTriangle size={15} /><span><strong>Private link — treat it like a password.</strong> Anyone with this company link can view candidate status and reports. Share it only with the hiring team.</span><button className="company-btn compact" style={{ marginLeft: 'auto', flex: '0 0 auto' }} onClick={() => void copy('', true)} data-testid="button-copy-company-link"><Clipboard size={12} />{copiedCompany ? 'Copied' : 'Copy link'}</button></div>
                  </div>
                </section>
                {copyError && <div className="company-error" role="alert" style={{ marginTop: 12 }}>{copyError}</div>}
                <div className="company-card-note" style={{ marginTop: 17, display: 'flex', alignItems: 'center', gap: 7 }}><Clock3 size={13} />Workspace updates automatically every 5 seconds.</div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function QuestionEditor({ draft, setDraft }: { draft: QuestionDraft; setDraft: (draft: QuestionDraft) => void }) {
  const updateBehavioral = (field: 'requirement' | 'prompt' | 'reference_note', value: string) => setDraft({ ...draft, behavioral: { ...draft.behavioral, [field]: value } });
  const updateTechnical = (field: 'requirement' | 'prompt' | 'reference_note' | 'follow_up', value: string) => setDraft({ ...draft, technical: { ...draft.technical, [field]: value } });
  return (
    <div className="question-stack">
      <div className="question-panel">
        <div className="question-panel-head"><span className="question-label">01 / Behavioral</span><span className="company-status">~1 minute</span></div>
        <div className="company-field"><label>Requirement being assessed</label><input value={draft.behavioral.requirement} onChange={(event) => updateBehavioral('requirement', event.target.value)} data-testid="input-behavioral-requirement" /></div>
        <div className="company-field"><label>Candidate prompt</label><textarea value={draft.behavioral.prompt} onChange={(event) => updateBehavioral('prompt', event.target.value)} data-testid="input-behavioral-prompt" /></div>
        <div className="company-field"><label>Scoring reference — private</label><textarea value={draft.behavioral.reference_note ?? ''} onChange={(event) => updateBehavioral('reference_note', event.target.value)} placeholder="Evidence your reviewers should look for. Never shown to candidates." data-testid="input-behavioral-reference" /></div>
      </div>
      <div className="question-panel">
        <div className="question-panel-head"><span className="question-label">02 / Technical</span><span className="company-status">~1 minute</span></div>
        <div className="company-field"><label>Requirement being assessed</label><input value={draft.technical.requirement} onChange={(event) => updateTechnical('requirement', event.target.value)} data-testid="input-technical-requirement" /></div>
        <div className="company-field"><label>Candidate task</label><textarea value={draft.technical.prompt} onChange={(event) => updateTechnical('prompt', event.target.value)} data-testid="input-technical-prompt" /></div>
        <div className="company-field"><label>Follow-up</label><textarea value={draft.technical.follow_up} onChange={(event) => updateTechnical('follow_up', event.target.value)} data-testid="input-technical-follow-up" /></div>
        <div className="company-field"><label>Scoring reference — private</label><textarea value={draft.technical.reference_note ?? ''} onChange={(event) => updateTechnical('reference_note', event.target.value)} placeholder="Evidence your reviewers should look for. Never shown to candidates." data-testid="input-technical-reference" /></div>
      </div>
      <div className="question-panel">
        <div className="question-panel-head"><span className="question-label">Code task setup</span><span className="company-status">Python</span></div>
        <div className="company-field"><label>Starter code</label><textarea style={{ minHeight: 120, fontFamily: "'DM Mono',monospace", fontSize: 11 }} value={draft.starter_code} onChange={(event) => setDraft({ ...draft, starter_code: event.target.value })} data-testid="input-starter-code" /></div>
      </div>
    </div>
  );
}

function ReadOnlyQuestions({ draft }: { draft: QuestionDraft }) {
  return (
    <div className="question-stack">
      {[
        { label: '01 / Behavioral', question: draft.behavioral, followUp: '' },
        { label: '02 / Technical', question: draft.technical, followUp: draft.technical.follow_up },
      ].map(({ label, question, followUp }) => (
        <div className="question-panel" key={label}>
          <div className="question-panel-head"><span className="question-label">{label}</span><span className="company-status">~1 minute</span></div>
          <div className="company-field"><label>Requirement</label><div className="company-note">{question.requirement}</div></div>
          <div className="company-field"><label>Candidate prompt</label><div className="company-note">{question.prompt}</div></div>
          {followUp && <div className="company-field"><label>Follow-up</label><div className="company-note">{followUp}</div></div>}
          {question.reference_note && <div className="company-field"><label>Scoring reference — private</label><div className="company-note">{question.reference_note}</div></div>}
        </div>
      ))}
      <div className="question-panel"><div className="question-panel-head"><span className="question-label">Code task setup</span><span className="company-status">Python</span></div><pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', margin: 0, color: '#536b77', font: "11px/1.65 'DM Mono',monospace" }}>{draft.starter_code || 'No starter code'}</pre></div>
      <div className="company-note"><LockKeyhole size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />This question snapshot is approved and permanently read-only.</div>
    </div>
  );
}
