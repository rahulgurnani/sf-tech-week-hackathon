import { useState, type FormEvent } from 'react';
import { ArrowRight, CheckCircle2, ShieldCheck } from 'lucide-react';
import { useCreateCompanyAudition } from '@workspace/api-client-react';
import AuditionLogo from '@/components/audition-logo';
import { useLocation } from 'wouter';

export default function NewAuditionPage() {
  const [, setLocation] = useLocation();
  const createAudition = useCreateCompanyAudition();
  const [company, setCompany] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [role, setRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createAudition.mutate({
      data: {
        company: company.trim(),
        contact_email: contactEmail.trim(),
        role: role.trim(),
        job_description: jobDescription.trim(),
      },
    }, {
      onSuccess: (result) => setLocation(`/company/${result.company_token}`),
    });
  };

  return (
    <main className="new-audition-page">
      <section className="new-audition-hero">
        <div className="new-audition-hero-inner">
          <AuditionLogo />
          <h1>One short audition.<br />A fairer signal for every candidate.</h1>
          <p>Build the same evidence-based assessment for everyone in the process, then decide together who deserves a human callback.</p>
        </div>
      </section>
      <section className="new-audition-main">
        <div className="company-card new-audition-card">
          <div className="company-card-body">
            <div className="new-audition-intro">
              <h2>Start with the role</h2>
              <p>We’ll create a private company workspace where your team can review and approve the audition before inviting anyone.</p>
            </div>
            <form className="company-form" onSubmit={submit}>
              <div className="company-form-grid">
                <div className="company-field">
                  <label htmlFor="company">Company</label>
                  <input id="company" name="company" required minLength={1} maxLength={120} autoComplete="organization" placeholder="e.g. Northstar Labs" value={company} onChange={(event) => setCompany(event.target.value)} data-testid="input-company" />
                </div>
                <div className="company-field">
                  <label htmlFor="contact-email">Your work email</label>
                  <input id="contact-email" name="contact_email" type="email" required autoComplete="email" placeholder="you@company.com" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} data-testid="input-contact-email" />
                </div>
                <div className="company-field company-full">
                  <label htmlFor="role">Role you’re hiring for</label>
                  <input id="role" name="role" required maxLength={160} placeholder="e.g. Senior platform engineer" value={role} onChange={(event) => setRole(event.target.value)} data-testid="input-role" />
                </div>
                <div className="company-field company-full">
                  <label htmlFor="job-description">Job description</label>
                  <textarea id="job-description" name="job_description" required minLength={10} maxLength={8000} placeholder="Describe the work, core responsibilities, and what good looks like in this role." value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} data-testid="input-job-description" />
                </div>
              </div>
              {createAudition.isError && <div className="company-error" role="alert">{createAudition.error instanceof Error ? createAudition.error.message : 'We could not create your workspace. Please try again.'}</div>}
              <div className="company-form-actions">
                <span className="company-card-note" style={{ marginRight: 'auto' }}><ShieldCheck size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Private company link; share it only with your hiring team.</span>
                <button className="company-btn primary" type="submit" disabled={createAudition.isPending} data-testid="button-create-audition">
                  {createAudition.isPending ? 'Creating workspace…' : 'Create workspace'} <ArrowRight size={14} />
                </button>
              </div>
              {createAudition.isSuccess && <p className="company-card-note" aria-live="polite"><CheckCircle2 size={13} style={{ display: 'inline', verticalAlign: '-2px', marginRight: 5 }} />Workspace created. Opening your private link…</p>}
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
