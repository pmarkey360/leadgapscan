"use client";
import { useMemo, useState } from "react";

// --- Calculation logic (kept in this file so there's nothing else to wire up) ---

type CalcInputs = {
  inquiries: number;
  avgJob: number;
  closeRate: number;
  answerRate: number;
  formHours: number;
  failedCount: number;
};

function clampNumber(value: number, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function sanitizeInputs(raw: Partial<CalcInputs>): CalcInputs {
  return {
    inquiries: clampNumber(raw.inquiries ?? NaN, 0, 1_000_000, 0),
    avgJob: clampNumber(raw.avgJob ?? NaN, 0, 10_000_000, 0),
    closeRate: clampNumber(raw.closeRate ?? NaN, 0, 100, 0),
    answerRate: clampNumber(raw.answerRate ?? NaN, 0, 100, 0),
    formHours: clampNumber(raw.formHours ?? NaN, 0, 24 * 30, 0),
    failedCount: clampNumber(raw.failedCount ?? NaN, 0, 10, 0),
  };
}

function calculateLeadGap(raw: Partial<CalcInputs>) {
  const { inquiries, avgJob, closeRate, answerRate, formHours, failedCount } = sanitizeInputs(raw);

  const callGap = inquiries * 0.65 * Math.max(0, 1 - answerRate / 100) * 0.7;

  const responsePenalty =
    formHours <= 1 ? 0.02 : formHours <= 4 ? 0.08 : formHours <= 24 ? 0.18 : 0.28;
  const formGap = inquiries * 0.35 * responsePenalty;

  const issueGap = inquiries * Math.min(0.12, failedCount * 0.018) * 0.6;

  const gap = Math.min(inquiries * 0.35, callGap + formGap + issueGap);

  const jobs = (gap * closeRate) / 100;
  const revenue = jobs * avgJob;

  const rawScore = 100 - failedCount * 6.5 - (100 - answerRate) * 0.28 - responsePenalty * 34;
  const score = Math.max(22, Math.min(100, Math.round(rawScore)));

  return { callGap, formGap, issueGap, gap, jobs, revenue, score };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function isPlausibleWebsite(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (/\s/.test(v)) return false;
  const stripped = v.replace(/^https?:\/\//i, "").replace(/^www\./i, "");
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(stripped);
}

const industries = [
  ["HVAC",850,52],["Plumbing",475,55],["Electrical",650,48],["Roofing",9200,32],["Dumpster Rental",575,58],
  ["Landscaping",2400,38],["Pest Control",325,62],["Garage Door",725,51],["Auto Body",2800,43],["Towing",275,67],
  ["Cleaning",240,57],["Pressure Washing",425,53],["Tree Service",1800,41],["Painting",3900,36],["Flooring",5100,34],
  ["Remodeling",18500,28],["Pool Service",450,56],["Moving",1650,44],["Locksmith",225,69],["Appliance Repair",310,61],
  ["Water Damage",3200,46],["Junk Removal",525,59],["Lawn Care",185,64],["Fencing",4800,35],["Concrete",6500,31],
  ["Solar",18500,24],["Property Management",1800,40],["Chiropractic",165,58],["Dental",425,54],["Legal Services",3500,27]
] as const;

const checks = [
  ["mobileCall","Tap-to-call button","Is there a prominent phone button on mobile?","Make the primary phone action visible without forcing visitors to hunt."],
  ["shortForm","Short contact form","Does the first form ask for 5 fields or fewer?","Reduce the first step, then collect project details during follow-up."],
  ["responseTime","Response expectation","Does the site say when a prospect will hear back?","Set a realistic response expectation beside the form."],
  ["servicePages","Focused service pages","Does each core service have a useful page?","Create focused pages for services customers actively search for."],
  ["location","Clear service area","Are the primary city and service area easy to find?","Add accurate location and service-area signals to key pages."],
  ["trust","Visible trust signals","Are reviews, credentials, or proof near the CTA?","Place relevant proof close to the decision point."],
  ["mobile","Mobile experience","Is the site easy to use on a phone?","Test the full call and form journey on common mobile sizes."],
  ["speed","Fast first load","Does the main page feel usable within about 3 seconds?","Compress large images and review scripts, fonts, and caching."],
  ["afterHours","After-hours path","Can visitors take a useful next step after hours?","Offer a form, scheduling option, or clear callback expectation."],
  ["tracking","Lead tracking","Can the business identify calls and forms from the website?","Track calls and forms so improvements can be measured."]
] as const;

type Answers = Record<string, boolean | null>;

const DEFAULTS = {
  inquiries: 120,
  avgJob: 850,
  answerRate: 82,
  formHours: 4,
  closeRate: 52,
};

/**
 * Parse a <input type="number"> change event into a bounded number.
 * Returns `fallback` for empty strings or anything non-numeric instead
 * of letting NaN leak into state (which previously showed "NaN" in the
 * UI once it reached the calculation).
 */
function parseBoundedNumber(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [industry, setIndustry] = useState("HVAC");
  const [website, setWebsite] = useState("");
  const [websiteTouched, setWebsiteTouched] = useState(false);

  const [inquiries, setInquiries] = useState(DEFAULTS.inquiries);
  const [avgJob, setAvgJob] = useState(DEFAULTS.avgJob);
  const [answerRate, setAnswerRate] = useState(DEFAULTS.answerRate);
  const [formHours, setFormHours] = useState(DEFAULTS.formHours);
  const [closeRate, setCloseRate] = useState(DEFAULTS.closeRate);

  const [answers, setAnswers] = useState<Answers>(() =>
    Object.fromEntries(checks.map((c) => [c[0], null])),
  );
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailTouched, setEmailTouched] = useState(false);
  const [reportSent, setReportSent] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const preset = industries.find((x) => x[0] === industry) ?? industries[0];
  const websiteIsValid = isPlausibleWebsite(website);
  const emailIsValid = isValidEmail(email);

  const failed = useMemo(
    () => checks.filter((c) => answers[c[0]] === false),
    [answers],
  );
  const answered = useMemo(
    () => checks.filter((c) => answers[c[0]] !== null).length,
    [answers],
  );

  const result = useMemo(
    () =>
      calculateLeadGap({
        inquiries,
        avgJob,
        closeRate,
        answerRate,
        formHours,
        failedCount: failed.length,
      }),
    [inquiries, avgJob, closeRate, answerRate, formHours, failed.length],
  );

  function changeIndustry(v: string) {
    setIndustry(v);
    const p = industries.find((x) => x[0] === v);
    if (p) {
      setAvgJob(p[1]);
      setCloseRate(p[2]);
    }
  }

  function go(n: number, id: string) {
    setStep(n);
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 40);
  }

  function resetAll() {
    setStep(1);
    setIndustry("HVAC");
    setWebsite("");
    setWebsiteTouched(false);
    setInquiries(DEFAULTS.inquiries);
    setAvgJob(DEFAULTS.avgJob);
    setAnswerRate(DEFAULTS.answerRate);
    setFormHours(DEFAULTS.formHours);
    setCloseRate(DEFAULTS.closeRate);
    setAnswers(Object.fromEntries(checks.map((c) => [c[0], null])));
    setEmail("");
    setEmailTouched(false);
    setReportSent("idle");
  }

  /**
   * Submits the captured email for the report gate. Wired to a same-origin
   * API route so the "you agree to receive this report" copy in the modal
   * is actually backed by something. Replace /api/report-lead with your
   * real endpoint (Netlify Forms, CRM webhook, etc.) before launch — this
   * fails gracefully (no crash, visible error state) if that route doesn't
   * exist yet.
   */
  async function submitReportRequest() {
    if (!emailIsValid) return;
    setReportSent("sending");
    try {
      const res = await fetch("/api/report-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          website,
          industry,
          score: result.score,
          gap: result.gap,
        }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      setReportSent("sent");
      setEmailOpen(false);
      setTimeout(() => window.print(), 100);
    } catch {
      // Don't block the user from getting their printable report just
      // because lead capture failed — but surface it instead of pretending
      // it worked.
      setReportSent("error");
      setEmailOpen(false);
      setTimeout(() => window.print(), 100);
    }
  }

  return (
    <main>
      <header className="nav shell">
        <a className="brand" href="#top">
          <span className="brandMark">L</span>
          <span>LeadGap<span>Scan</span></span>
        </a>
        <nav>
          <a href="#how">How it works</a>
          <a href="#benchmarks">Benchmarks</a>
          <a href="#about">About</a>
        </nav>
        <a className="navCta" href="#scanner">Run free scan</a>
      </header>

      <section id="top" className="hero shell">
        <div className="heroCopy">
          <div className="eyebrow"><i />Built for local service businesses</div>
          <h1>Find where your website is <em>losing leads.</em></h1>
          <p className="lead">
            A practical 3-minute scan that turns website friction, response gaps, and your
            real business numbers into prioritized fixes.
          </p>
          <div className="heroActions">
            <a className="primary" href="#scanner">Scan my website <span>→</span></a>
            <a className="textLink" href="#how">See how the math works</a>
          </div>
          <div className="trustRow">
            <span>✓ No credit card</span>
            <span>✓ Transparent estimates</span>
            <span>✓ Instant action plan</span>
          </div>
        </div>
        <div className="heroVisual">
          <div className="miniCard topCard">
            <span>Potential inquiry gap</span>
            <strong>14 <small>/ month</small></strong>
            <div className="bars"><i /><i /><i /><i /><i /></div>
          </div>
          <div className="miniCard scoreCard">
            <div className="ring"><b>67</b><small>LEAD<br />READINESS</small></div>
            <div>
              <span>Biggest opportunity</span>
              <strong>Mobile response</strong>
              <small>3 priority fixes found</small>
            </div>
          </div>
          <div className="miniCard issueCard">
            <i>!</i>
            <div><strong>After-hours leads</strong><span>No next step is shown</span></div>
            <b>HIGH</b>
          </div>
          <div className="glow" />
        </div>
      </section>

      <section className="proof">
        <div className="shell proofGrid">
          <div><b>10</b><span>lead-conversion checks</span></div>
          <div><b>30</b><span>service industries</span></div>
          <div><b>3 min</b><span>to your action plan</span></div>
          <div><b>100%</b><span>assumptions disclosed</span></div>
        </div>
      </section>

      <section id="scanner" className="scannerSection shell">
        <div className="sectionIntro">
          <div>
            <span className="kicker">FREE LEAD GAP SCAN</span>
            <h2>Start with the numbers you know.</h2>
          </div>
          <p>Your inputs drive the estimate. Industry presets are only starting points and remain editable.</p>
        </div>

        <div className="scannerCard">
          <div className="progress">
            <div className={step >= 1 ? "active" : ""}><b>1</b><span>Business</span></div>
            <i className={step >= 2 ? "active" : ""} />
            <div className={step >= 2 ? "active" : ""}><b>2</b><span>Website checks</span></div>
            <i className={step >= 3 ? "active" : ""} />
            <div className={step >= 3 ? "active" : ""}><b>3</b><span>Your results</span></div>
          </div>

          {step === 1 && (
            <div className="formPanel">
              <div className="field wide">
                <label htmlFor="website-input">Website address</label>
                <div className="urlInput">
                  <span>⌁</span>
                  <input
                    id="website-input"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    onBlur={() => setWebsiteTouched(true)}
                    placeholder="yourbusiness.com"
                    aria-invalid={websiteTouched && !websiteIsValid}
                  />
                </div>
                {websiteTouched && website.trim() !== "" && !websiteIsValid && (
                  <small style={{ color: "#a84d19" }}>
                    Enter a website like yourbusiness.com
                  </small>
                )}
              </div>

              <div className="field">
                <label htmlFor="industry-select">Industry</label>
                <select id="industry-select" value={industry} onChange={(e) => changeIndustry(e.target.value)}>
                  {industries.map((i) => <option key={i[0]}>{i[0]}</option>)}
                </select>
                <small>Sets an editable starting benchmark</small>
              </div>

              <div className="field">
                <label htmlFor="inquiries-input">Monthly inquiries</label>
                <input
                  id="inquiries-input"
                  type="number"
                  min="0"
                  inputMode="numeric"
                  value={inquiries}
                  onChange={(e) => setInquiries(parseBoundedNumber(e.target.value, 0, 1_000_000, 0))}
                />
                <small>Calls + forms + chat leads</small>
              </div>

              <div className="field">
                <label htmlFor="avgjob-input">Average job value</label>
                <div className="money">
                  <span>$</span>
                  <input
                    id="avgjob-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={avgJob}
                    onChange={(e) => setAvgJob(parseBoundedNumber(e.target.value, 0, 10_000_000, 0))}
                  />
                </div>
                <small>Use your actual average if known</small>
              </div>

              <div className="field">
                <label htmlFor="closerate-input">Inquiry-to-job rate</label>
                <div className="suffix">
                  <input
                    id="closerate-input"
                    type="number"
                    min="0"
                    max="100"
                    inputMode="numeric"
                    value={closeRate}
                    onChange={(e) => setCloseRate(parseBoundedNumber(e.target.value, 0, 100, 0))}
                  />
                  <span>%</span>
                </div>
                <small>Industry starting point: {preset[2]}%</small>
              </div>

              <div className="field">
                <label htmlFor="answerrate-input">Calls answered live</label>
                <div className="suffix">
                  <input
                    id="answerrate-input"
                    type="number"
                    min="0"
                    max="100"
                    inputMode="numeric"
                    value={answerRate}
                    onChange={(e) => setAnswerRate(parseBoundedNumber(e.target.value, 0, 100, 0))}
                  />
                  <span>%</span>
                </div>
                <small>Your best estimate is enough</small>
              </div>

              <div className="field">
                <label htmlFor="formhours-input">Average form response</label>
                <div className="suffix">
                  <input
                    id="formhours-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={formHours}
                    onChange={(e) => setFormHours(parseBoundedNumber(e.target.value, 0, 24 * 30, 0))}
                  />
                  <span>hours</span>
                </div>
                <small>Time until first human response</small>
              </div>

              <button
                className="primary scanBtn"
                onClick={() => websiteIsValid && go(2, "scanner")}
                disabled={!websiteIsValid}
              >
                Continue to website checks <span>→</span>
              </button>
              <p className="privacy">🔒 Your inputs stay in this browser unless you choose to submit the report form.</p>
            </div>
          )}

          {step === 2 && (
            <div className="checkPanel">
              <div className="checkHeader">
                <div>
                  <span className="kicker">QUICK REVIEW</span>
                  <h3>Answer what you can see.</h3>
                </div>
                <div><b>{answered}/{checks.length}</b><span>complete</span></div>
              </div>
              <p className="muted">
                This guided scan does not automatically crawl or test your website. Check the site
                before choosing an answer.
              </p>
              <div className="checkList">
                {checks.map((c, i) => (
                  <div className="checkRow" key={c[0]}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    <div><strong>{c[1]}</strong><span>{c[2]}</span></div>
                    <div className="choice" role="group" aria-label={c[1]}>
                      <button
                        type="button"
                        className={answers[c[0]] === true ? "yes selected" : "yes"}
                        aria-pressed={answers[c[0]] === true}
                        onClick={() => setAnswers({ ...answers, [c[0]]: true })}
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        className={answers[c[0]] === false ? "no selected" : "no"}
                        aria-pressed={answers[c[0]] === false}
                        onClick={() => setAnswers({ ...answers, [c[0]]: false })}
                      >
                        No
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <button
                className="primary scanBtn"
                onClick={() => answered === checks.length && go(3, "results")}
                disabled={answered < checks.length}
              >
                Build my action plan <span>→</span>
              </button>
              <button type="button" className="back" onClick={() => setStep(1)}>← Back to business details</button>
            </div>
          )}

          {step === 3 && (
            <div id="results" className="resultsPanel">
              <div className="resultsTop">
                <div>
                  <span className="kicker">YOUR LEAD GAP SNAPSHOT</span>
                  <h3>{website.replace(/^https?:\/\//, "")}</h3>
                  <p>Based on your inputs and the {industry} starting profile.</p>
                </div>
                <div className="score">
                  <b>{result.score}</b><span>/100</span><small>LEAD READINESS</small>
                </div>
              </div>

              <div className="metricGrid">
                <article>
                  <span>Estimated inquiry gap</span>
                  <strong>{Math.round(result.gap)}<small>/mo</small></strong>
                  <p>Potentially affected inquiries</p>
                </article>
                <article>
                  <span>Estimated job opportunity</span>
                  <strong>{result.jobs.toFixed(1)}<small>/mo</small></strong>
                  <p>Using your {closeRate}% close rate</p>
                </article>
                <article className="accent">
                  <span>Revenue opportunity scenario</span>
                  <strong>${Math.round(result.revenue).toLocaleString()}<small>/mo</small></strong>
                  <p>Not measured lost revenue</p>
                </article>
              </div>

              <div className="formula">
                <strong>How this estimate was calculated</strong>
                <div>
                  <span>Missed-call exposure <b>{result.callGap.toFixed(1)}</b></span>
                  <span>Form-response exposure <b>{result.formGap.toFixed(1)}</b></span>
                  <span>Website-friction adjustment <b>{result.issueGap.toFixed(1)}</b></span>
                </div>
                <p>
                  We estimate 65% of inquiries arrive by phone and apply a 70% loss-risk factor to
                  unanswered calls. Form risk rises with response time. Website issues receive a
                  conservative, overlap-adjusted estimate capped at 12%. Total estimated gap is capped
                  at 35% of inquiries. Replace every input with measured data when available.
                </p>
              </div>

              <div className="actionHead">
                <div>
                  <span className="kicker">PRIORITY ACTION PLAN</span>
                  <h3>Fix the clearest friction first.</h3>
                </div>
                <span>{failed.length} opportunities found</span>
              </div>
              <div className="actions">
                {(failed.length ? failed : checks.slice(0, 3)).slice(0, 5).map((c, i) => (
                  <article key={c[0]}>
                    <b>{i + 1}</b>
                    <div>
                      <span>{i < 2 ? "HIGH PRIORITY" : "MEDIUM PRIORITY"}</span>
                      <h4>{failed.length ? c[1] : "Keep monitoring: " + c[1]}</h4>
                      <p>{failed.length ? c[3] : "You marked this as present. Test it regularly and compare against lead data."}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="resultActions">
                <button className="primary" onClick={() => setEmailOpen(true)}>
                  Get printable report <span>↓</span>
                </button>
                <button className="secondary" onClick={resetAll}>Run another scan</button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section id="how" className="how">
        <div className="shell">
          <div className="sectionIntro light">
            <div>
              <span className="kicker">HOW IT WORKS</span>
              <h2>A useful estimate, not a scare tactic.</h2>
            </div>
            <p>LeadGapScan separates your inputs, visible website signals, and calculation assumptions.</p>
          </div>
          <div className="howGrid">
            <article><b>01</b><h3>Add real inputs</h3><p>Use monthly inquiries, average job value, answer rate, response time, and close rate.</p></article>
            <article><b>02</b><h3>Review friction</h3><p>Complete ten practical checks covering calls, forms, mobile use, trust, and local signals.</p></article>
            <article><b>03</b><h3>Prioritize fixes</h3><p>See the estimated exposure, the formula behind it, and the next actions worth testing.</p></article>
          </div>
        </div>
      </section>

      <section id="benchmarks" className="bench shell">
        <div className="sectionIntro">
          <div>
            <span className="kicker">INDUSTRY STARTING POINTS</span>
            <h2>Benchmarks you can override.</h2>
          </div>
          <p>Presets speed up the first scan. Your own CRM and accounting data should replace them whenever possible.</p>
        </div>
        <div className="industryCloud">
          {industries.map((i) => (
            <button key={i[0]} onClick={() => { changeIndustry(i[0]); go(1, "scanner"); }}>
              {i[0]} <span>${i[1].toLocaleString()} avg.</span>
            </button>
          ))}
        </div>
      </section>

      <section id="about" className="finalCta">
        <div className="shell">
          <span className="kicker">START WITH CLARITY</span>
          <h2>You do not need more traffic if the current leads are slipping through.</h2>
          <p>Run the scan, verify the assumptions, and fix the highest-confidence gap first.</p>
          <a className="primary inverse" href="#scanner">Run your free scan <span>→</span></a>
        </div>
      </section>

      <footer>
        <div className="shell">
          <div className="brand"><span className="brandMark">L</span><span>LeadGap<span>Scan</span></span></div>
          <p>Practical lead-conversion diagnostics for local service businesses.</p>
          <small>© 2026 Patrick Digital AI. Estimates are directional and do not guarantee revenue or performance.</small>
        </div>
      </footer>

      {emailOpen && (
        <div
          className="modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
          onMouseDown={(e) => e.target === e.currentTarget && setEmailOpen(false)}
        >
          <div className="modalCard">
            <button type="button" className="close" aria-label="Close" onClick={() => setEmailOpen(false)}>×</button>
            <span className="kicker">YOUR REPORT</span>
            <h3 id="report-modal-title">Save your LeadGapScan results</h3>
            <p>Enter your email to open a clean printable report.</p>
            <label htmlFor="report-email-input">Email address</label>
            <input
              id="report-email-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailTouched(true)}
              placeholder="you@business.com"
              aria-invalid={emailTouched && !emailIsValid}
            />
            {emailTouched && email.trim() !== "" && !emailIsValid && (
              <small style={{ color: "#a84d19" }}>Enter a valid email address</small>
            )}
            <button
              className="primary"
              onClick={submitReportRequest}
              disabled={!emailIsValid || reportSent === "sending"}
            >
              {reportSent === "sending" ? "Sending…" : "Open printable report"} <span>→</span>
            </button>
            <small>By continuing, you agree to receive this report and relevant follow-up. No spam.</small>
          </div>
        </div>
      )}
    </main>
  );
}
