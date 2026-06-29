/**
 * Contact - let a medical-device team reach the Smarticus crew.
 *
 * No backend dependency: the form composes a structured mailto to
 * hello@thinkertons.com so it works in every deployment. On submit we open the
 * user's mail client and show an inline confirmation so the page never feels
 * like it dropped the request.
 */

import { useState, type FormEvent } from 'react';
import { useLocation } from 'wouter';
import { ThemeToggle } from '../components/ui/ThemeToggle.js';
import { SmarticusWordmark, SmarticusByThinkertonsLockup } from '../components/ui/logos.js';

const CONTACT_EMAIL = 'hello@thinkertons.com';

interface ContactForm {
  name: string;
  email: string;
  organization: string;
  role: string;
  message: string;
}

const EMPTY_FORM: ContactForm = {
  name: '',
  email: '',
  organization: '',
  role: '',
  message: '',
};

function buildMailto(form: ContactForm): string {
  const subject = `Smarticus enquiry - ${form.organization || form.name || 'new contact'}`;
  const lines = [
    `Name: ${form.name}`,
    `Work email: ${form.email}`,
    `Organization: ${form.organization}`,
    `Role: ${form.role}`,
    '',
    form.message,
  ];
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

export function Contact() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [submitted, setSubmitted] = useState(false);

  const update = (field: keyof ContactForm) => (e: { target: { value: string } }) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    window.location.href = buildMailto(form);
    setSubmitted(true);
  }

  const canSubmit = form.name.trim() !== '' && form.email.trim() !== '' && form.message.trim() !== '';

  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh', color: 'var(--ink)' }}>
      <style>{`
        .contact-field { display: grid; gap: 6px; }
        .contact-label {
          font-family: var(--mono); font-size: 10px; letter-spacing: 0.12em;
          text-transform: uppercase; color: var(--ink-3);
        }
        .contact-input, .contact-textarea {
          width: 100%; box-sizing: border-box; padding: 11px 13px;
          background: var(--surface); border: 1px solid var(--rule);
          border-radius: var(--r-2); color: var(--ink); font-size: 14.5px;
          font-family: var(--sans); transition: border-color var(--t-fast) var(--ease);
        }
        .contact-input:focus, .contact-textarea:focus {
          outline: none; border-color: var(--orange);
        }
        .contact-textarea { resize: vertical; min-height: 130px; line-height: 1.55; }
        .contact-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 720px) { .contact-row { grid-template-columns: 1fr; } }
      `}</style>

      <nav
        style={{
          position: 'sticky', top: 0, zIndex: 50,
          height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 32px', borderBottom: '1px solid var(--rule)',
          background: 'color-mix(in srgb, var(--paper) 92%, transparent)', backdropFilter: 'blur(8px)',
        }}
      >
        <button
          onClick={() => navigate('/')}
          style={{ border: 0, background: 'transparent', cursor: 'pointer', padding: 0 }}
          aria-label="Back to home"
        >
          <SmarticusWordmark size={16} tagline={false} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
          <button className="btn btn-ghost" onClick={() => navigate('/')}>
            Back to home
          </button>
        </div>
      </nav>

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '64px 32px 80px' }}>
        <div className="eyebrow" style={{ marginBottom: 14 }}>
          <span className="signal-dot" style={{ marginRight: 8, verticalAlign: 1 }} />
          Contact
        </div>
        <h1 style={{ margin: 0, fontSize: 'clamp(30px, 4.4vw, 46px)', fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.08 }}>
          Talk to the team behind Smarticus.
        </h1>
        <p style={{ margin: '16px 0 0', maxWidth: 560, color: 'var(--ink-2)', fontSize: 16, lineHeight: 1.55 }}>
          Tell us about your device, your post-market surveillance workload, and where Smarticus fits.
          We read every message and reply from a real person.
        </p>

        {submitted ? (
          <div
            style={{
              marginTop: 36, padding: '28px 26px', background: 'var(--surface)',
              border: '1px solid var(--ok)', borderRadius: 'var(--r-3)',
            }}
          >
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600, letterSpacing: '-0.01em' }}>Thanks - your email is ready to send.</h2>
            <p style={{ margin: '12px 0 0', color: 'var(--ink-2)', fontSize: 14.5, lineHeight: 1.55 }}>
              We opened your mail client with the details pre-filled. If nothing appeared, email us directly at{' '}
              <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--orange)' }}>{CONTACT_EMAIL}</a>.
            </p>
            <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost" onClick={() => { setForm(EMPTY_FORM); setSubmitted(false); }}>
                Send another message
              </button>
              <button className="btn btn-orange" onClick={() => navigate('/')}>
                Back to home
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ marginTop: 36, display: 'grid', gap: 18 }}>
            <div className="contact-row">
              <div className="contact-field">
                <label className="contact-label" htmlFor="contact-name">Name</label>
                <input
                  id="contact-name" className="contact-input" type="text" required
                  value={form.name} onChange={update('name')} placeholder="Jordan Lee"
                />
              </div>
              <div className="contact-field">
                <label className="contact-label" htmlFor="contact-email">Work email</label>
                <input
                  id="contact-email" className="contact-input" type="email" required
                  value={form.email} onChange={update('email')} placeholder="jordan@device-co.com"
                />
              </div>
            </div>
            <div className="contact-row">
              <div className="contact-field">
                <label className="contact-label" htmlFor="contact-org">Organization</label>
                <input
                  id="contact-org" className="contact-input" type="text"
                  value={form.organization} onChange={update('organization')} placeholder="Device Co."
                />
              </div>
              <div className="contact-field">
                <label className="contact-label" htmlFor="contact-role">Role</label>
                <input
                  id="contact-role" className="contact-input" type="text"
                  value={form.role} onChange={update('role')} placeholder="QA / RA Manager"
                />
              </div>
            </div>
            <div className="contact-field">
              <label className="contact-label" htmlFor="contact-message">How can we help?</label>
              <textarea
                id="contact-message" className="contact-textarea" required
                value={form.message} onChange={update('message')}
                placeholder="We manufacture Class IIb devices and need help compiling PSURs across EU MDR and ISO 13485…"
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-orange" type="submit" disabled={!canSubmit}>
                Send message
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M3 6h6m-3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span style={{ fontSize: 13, color: 'var(--ink-3)' }}>
                or email <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: 'var(--orange)' }}>{CONTACT_EMAIL}</a>
              </span>
            </div>
          </form>
        )}

        <div style={{ marginTop: 64, paddingTop: 28, borderTop: '1px solid var(--rule)' }}>
          <SmarticusByThinkertonsLockup size={18} />
        </div>
      </main>
    </div>
  );
}

export default Contact;
