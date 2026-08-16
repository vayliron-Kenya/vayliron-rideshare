#!/usr/bin/env python3
"""Builds the self-contained visual walkthrough from the captured screens.

The Artifact CSP blocks every external request, so each screenshot is inlined
as a data URI. Run `npm run preview` first to capture them.

    python3 scripts/build-preview-page.py
"""
import base64
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SHOTS = ROOT / ".preview"
OUT = ROOT / ".preview" / "walkthrough.html"


def data_uri(name: str) -> str:
    raw = (SHOTS / name).read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


meta = {s["file"]: s for s in json.loads((SHOTS / "shots.json").read_text())}


def screen(file: str, device: str) -> str:
    shot = meta[file]
    chip = "Phone" if device == "phone" else "Desktop"
    return f"""
      <figure class="device device--{device}">
        <div class="device__bar"><span class="device__chip">{chip}</span></div>
        <div class="device__screen">
          <img src="{data_uri(file)}" alt="{shot['title']}: {shot['caption']}" loading="lazy" />
        </div>
      </figure>"""


def stop(index: int, eyebrow: str, title: str, lede: str, shots: list[tuple[str, str]]) -> str:
    panels = "".join(
        f"""
        <div class="panel">
          <div class="panel__text">
            <h3>{meta[f]['title']}</h3>
            <p>{meta[f]['caption']}</p>
          </div>
          {screen(f, d)}
        </div>"""
        for f, d in shots
    )
    return f"""
    <section class="stop" id="stop-{index}">
      <div class="stop__marker" aria-hidden="true"><span></span></div>
      <header class="stop__head">
        <p class="eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p class="lede">{lede}</p>
      </header>
      {panels}
    </section>"""


BODY = "".join(
    [
        stop(
            1,
            "Stage one",
            "The rider",
            "A commuter is standing at a stage in the dark, on a cheap phone, sometimes handing it "
            "to a child to read the time. These screens follow three rules: one obvious thing to do "
            "per screen, targets no smaller than a thumb, and labels you would say out loud.",
            [
                ("02-rider-today.jpg", "phone"),
                ("05-rider-booking.jpg", "phone"),
                ("03-rider-ticket.jpg", "phone"),
                ("04-rider-tracking.jpg", "phone"),
            ],
        ),
        stop(
            2,
            "Stage two",
            "The driver",
            "Built for one hand at a stage before dawn. A driver only ever sees the runs they are "
            "rostered on; a controller can open any door to cover for them.",
            [("06-driver-runs.jpg", "phone"), ("07-driver-run.jpg", "phone")],
        ),
        stop(
            3,
            "Stage three",
            "The client control panel",
            "What HR and finance at a corporate client actually operate. Deliberately dense — people "
            "paid to use a tool are served by information, not by big buttons.",
            [
                ("08-company-overview.jpg", "desktop"),
                ("09-company-people.jpg", "desktop"),
                ("10-company-invoice.jpg", "desktop"),
            ],
        ),
        stop(
            4,
            "Terminus",
            "Vayliron control",
            "The people running the network. This is the surface that did not exist at first: without "
            "it nobody at Vayliron could cancel a run, move a bus or answer a client asking what "
            "happened on Tuesday.",
            [
                ("11-ops-board.jpg", "desktop"),
                ("12-ops-trip.jpg", "desktop"),
                ("13-ops-audit.jpg", "desktop"),
            ],
        ),
    ]
)

HTML = f"""<title>Vayliron Shared Transportation</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  /* ---------------------------------------------------------------
     Palette taken from vayliron.com's own tokens, not invented here.
     Light is the ground; dark redefines only the tokens, in all three
     viewer states (system, pinned light, pinned dark).
     --------------------------------------------------------------- */
  :root {{
    --paper: #fcfbfd;
    --surface: #ffffff;
    --tint: #f6e7ff;
    --rule: #e2ddec;
    --ink: #0d0030;
    --muted: #5b5670;
    --faint: #837d99;
    --brand: #792b99;
    --vivid: #c947ff;
    --on-brand: #ffffff;

    --shadow: 0 1px 2px rgba(13, 0, 48, .05), 0 12px 32px -12px rgba(13, 0, 48, .16);

    --display: Gilmer, "Segoe UI", system-ui, -apple-system, sans-serif;
    --mono: ui-monospace, "SFMono-Regular", Menlo, monospace;

    --measure: 62ch;
  }}

  @media (prefers-color-scheme: dark) {{
    :root:not([data-theme="light"]) {{
      --paper: #0b0022;
      --surface: #150a33;
      --tint: #2b1145;
      --rule: #362a58;
      --ink: #ffffff;
      --muted: #b6b1c6;
      --faint: #8d87a3;
      --brand: #c947ff;
      --vivid: #e9b3ff;
      --on-brand: #12002c;
      --shadow: 0 1px 2px rgba(0, 0, 0, .5), 0 16px 40px -16px rgba(0, 0, 0, .7);
    }}
  }}

  :root[data-theme="dark"] {{
    --paper: #0b0022;
    --surface: #150a33;
    --tint: #2b1145;
    --rule: #362a58;
    --ink: #ffffff;
    --muted: #b6b1c6;
    --faint: #8d87a3;
    --brand: #c947ff;
    --vivid: #e9b3ff;
    --on-brand: #12002c;
    --shadow: 0 1px 2px rgba(0, 0, 0, .5), 0 16px 40px -16px rgba(0, 0, 0, .7);
  }}

  * {{ box-sizing: border-box; }}

  body {{
    margin: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--display);
    font-size: 17px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }}

  .wrap {{
    max-width: 1080px;
    margin: 0 auto;
    padding: 0 24px 96px;
  }}

  h1, h2, h3 {{ text-wrap: balance; margin: 0; letter-spacing: -.02em; }}
  p {{ margin: 0; }}

  .eyebrow {{
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: .16em;
    text-transform: uppercase;
    color: var(--brand);
  }}

  /* ---- Masthead ---- */
  .masthead {{
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 72px 0 56px;
    border-bottom: 1px solid var(--rule);
  }}
  .mark {{ display: flex; align-items: center; gap: 12px; }}
  .mark svg {{ width: 38px; height: 38px; }}
  .mark span {{ font-size: 15px; font-weight: 700; letter-spacing: -.01em; }}
  .mark em {{ font-style: normal; color: var(--muted); font-weight: 400; }}

  .masthead h1 {{
    font-size: clamp(38px, 6vw, 62px);
    line-height: 1.02;
    font-weight: 800;
  }}
  .masthead .lede {{ max-width: var(--measure); color: var(--muted); font-size: 19px; }}

  .facts {{
    display: flex;
    flex-wrap: wrap;
    gap: 8px 28px;
    margin-top: 8px;
    font-family: var(--mono);
    font-size: 13px;
    color: var(--faint);
  }}
  .facts b {{ color: var(--ink); font-weight: 600; font-variant-numeric: tabular-nums; }}

  /* ---- The line down the page: four stages, like a route ---- */
  .route {{ position: relative; }}
  .route::before {{
    content: "";
    position: absolute;
    left: 7px;
    top: 18px;
    bottom: 40px;
    width: 2px;
    background: linear-gradient(var(--vivid), var(--brand));
    opacity: .35;
  }}

  .stop {{ position: relative; padding: 64px 0 8px 44px; }}
  .stop__marker {{
    position: absolute;
    left: 0;
    top: 74px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--paper);
    border: 2px solid var(--brand);
    display: grid;
    place-items: center;
  }}
  .stop__marker span {{
    width: 6px; height: 6px; border-radius: 50%;
    background: var(--vivid);
    transform: scale(0);
    transition: transform .45s ease;
  }}
  .stop.is-here .stop__marker span {{ transform: scale(1); }}

  .stop__head {{ display: flex; flex-direction: column; gap: 10px; max-width: var(--measure); }}
  .stop__head h2 {{ font-size: clamp(28px, 3.4vw, 38px); font-weight: 800; }}
  .stop__head .lede {{ color: var(--muted); }}

  /* ---- One caption beside one screen ---- */
  .panel {{
    display: grid;
    grid-template-columns: 1fr;
    gap: 20px;
    padding: 40px 0;
    border-bottom: 1px solid var(--rule);
    align-items: start;
  }}
  .stop .panel:last-child {{ border-bottom: 0; }}
  .panel__text {{ display: flex; flex-direction: column; gap: 8px; max-width: var(--measure); }}
  .panel__text h3 {{ font-size: 20px; font-weight: 700; }}
  .panel__text p {{ color: var(--muted); font-size: 16px; }}

  @media (min-width: 900px) {{
    .panel {{ grid-template-columns: minmax(0, 1fr) auto; gap: 44px; }}
    .panel__text {{ position: sticky; top: 32px; }}
  }}

  /* ---- Device frames. Each screen scrolls inside its own frame, so a
         4,000px tall capture stays a viewport instead of a wall. ---- */
  .device {{ margin: 0; }}
  .device__bar {{
    display: flex;
    justify-content: flex-end;
    padding-bottom: 8px;
  }}
  .device__chip {{
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--faint);
  }}
  .device__screen {{
    overflow: auto;
    background: var(--surface);
    box-shadow: var(--shadow);
    border: 1px solid var(--rule);
  }}
  .device__screen img {{ display: block; width: 100%; height: auto; }}

  .device--phone .device__screen {{
    width: 300px;
    max-width: 100%;
    height: 560px;
    border-radius: 22px;
  }}
  .device--desktop .device__screen {{
    width: 560px;
    max-width: 100%;
    height: 420px;
    border-radius: 10px;
  }}

  /* ---- Closing blocks ---- */
  .band {{
    margin-top: 72px;
    padding: 36px;
    border-radius: 18px;
    background: var(--tint);
    border: 1px solid var(--rule);
  }}
  .band h2 {{ font-size: 24px; font-weight: 700; margin-bottom: 14px; }}

  .grid {{ display: grid; gap: 18px; grid-template-columns: 1fr; margin-top: 20px; }}
  @media (min-width: 760px) {{ .grid {{ grid-template-columns: 1fr 1fr; }} }}

  .card {{
    background: var(--surface);
    border: 1px solid var(--rule);
    border-radius: 14px;
    padding: 20px;
  }}
  .card h3 {{ font-size: 15px; font-weight: 700; margin-bottom: 6px; }}
  .card p {{ font-size: 15px; color: var(--muted); }}

  table {{ width: 100%; border-collapse: collapse; font-size: 15px; }}
  .scroll {{ overflow-x: auto; }}
  th, td {{ text-align: left; padding: 10px 14px 10px 0; border-bottom: 1px solid var(--rule); }}
  th {{
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: .1em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 500;
  }}
  td code {{ font-family: var(--mono); font-size: 13px; color: var(--brand); }}
  td.role {{ color: var(--muted); }}

  pre {{
    margin: 16px 0 0;
    padding: 16px 18px;
    border-radius: 12px;
    background: var(--surface);
    border: 1px solid var(--rule);
    overflow-x: auto;
    font-family: var(--mono);
    font-size: 13.5px;
    line-height: 1.7;
    color: var(--ink);
  }}

  ul.plain {{ margin: 12px 0 0; padding-left: 20px; color: var(--muted); font-size: 15px; }}
  ul.plain li {{ margin-bottom: 8px; }}
  ul.plain b {{ color: var(--ink); font-weight: 600; }}

  footer {{
    margin-top: 64px;
    padding-top: 24px;
    border-top: 1px solid var(--rule);
    font-family: var(--mono);
    font-size: 12px;
    color: var(--faint);
  }}

  a {{ color: var(--brand); }}
  :focus-visible {{ outline: 2px solid var(--vivid); outline-offset: 3px; border-radius: 4px; }}

  @media (prefers-reduced-motion: reduce) {{
    .stop__marker span {{ transition: none; transform: scale(1); }}
  }}
</style>

<div class="wrap">
  <header class="masthead">
    <div class="mark">
      <svg viewBox="0 0 28 28" aria-hidden="true">
        <rect x="1" y="1" width="26" height="26" rx="8" fill="var(--tint)" stroke="var(--brand)" stroke-width="1.2" />
        <rect x="7" y="8" width="14" height="10" rx="2.5" fill="var(--brand)" />
        <rect x="8.6" y="9.6" width="4.6" height="3.6" rx="1" fill="var(--tint)" />
        <rect x="14.8" y="9.6" width="4.6" height="3.6" rx="1" fill="var(--tint)" />
        <circle cx="10.4" cy="20" r="1.9" fill="var(--vivid)" />
        <circle cx="17.6" cy="20" r="1.9" fill="var(--vivid)" />
      </svg>
      <span>Vayliron <em>Shared Transportation</em></span>
    </div>

    <p class="eyebrow">Walkthrough · Nairobi</p>
    <h1>Four apps riding one network.</h1>
    <p class="lede">
      A corporate bus line for Nairobi: eight scheduled lines over 44 real stages, Monday to
      Saturday. Staff reserve a numbered seat and board with a six-character pass, drivers work
      the door from a phone, HR sees the bill, and Vayliron runs the whole thing from a live
      board. Every screen below is the running application, not a mockup.
    </p>

    <div class="facts">
      <span><b>8</b> lines</span>
      <span><b>44</b> stages</span>
      <span><b>480</b> seeded staff</span>
      <span><b>123</b> tests</span>
      <span><b>25</b> browser checks</span>
    </div>
  </header>

  <div class="route">
    {BODY}
  </div>

  <section class="band">
    <h2>Try it yourself</h2>
    <p style="color: var(--muted); max-width: var(--measure);">
      One sign-in serves all four apps — where you land depends on whose address it is. There is no
      password: the demo identifies people by email alone, which is the first thing to replace
      before real staff data goes near it.
    </p>

    <div class="panel" style="border-bottom: 0; padding-top: 24px;">
      <div class="panel__text">
        <h3>{meta['01-landing.jpg']['title']}</h3>
        <p>{meta['01-landing.jpg']['caption']}</p>
      </div>
      {screen('01-landing.jpg', 'desktop')}
    </div>

    <div class="scroll">
      <table>
        <thead>
          <tr><th>Email</th><th>Opens</th><th>Who they are</th></tr>
        </thead>
        <tbody>
          <tr><td><code>naliaka.wekesa@vayliron.co.ke</code></td><td>/ops</td><td class="role">Network admin — can also edit the fleet and client contracts</td></tr>
          <tr><td><code>daniel.mutiso@vayliron.co.ke</code></td><td>/ops</td><td class="role">Controller — runs the daily board</td></tr>
          <tr><td><code>peter.mwangi@vayliron.co.ke</code></td><td>/drive</td><td class="role">Driver</td></tr>
          <tr><td><code>wanjiku.karanja@tandaza.co.ke</code></td><td>/dashboard</td><td class="role">Rider and HR admin — Tandaza Bank, 100% subsidy</td></tr>
          <tr><td><code>brenda.atieno@zurihealth.co.ke</code></td><td>/dashboard</td><td class="role">Rider and HR admin — Zuri Health, 75% with a monthly cap</td></tr>
          <tr><td><code>otieno.odhiambo@tandaza.co.ke</code></td><td>/dashboard</td><td class="role">Rider only</td></tr>
        </tbody>
      </table>
    </div>

<pre>git clone &amp;&amp; npm install
npm run db:reset   # builds ~40 service days of history
npm run dev        # http://localhost:3000</pre>
  </section>

  <section class="band" style="background: var(--surface);">
    <h2>Light by default, dark on request</h2>
    <div class="panel" style="border-bottom: 0; padding-top: 20px;">
      <div class="panel__text">
        <p style="color: var(--muted);">
          vayliron.com is a light site, so the app is light out of the box. The control in the
          header pins light or dark, or follows the phone's own setting — and a pinned choice is
          applied before the first paint, so it never flashes the wrong one.
        </p>
      </div>
      {screen('14-dark.jpg', 'phone')}
    </div>
  </section>

  <section class="band" style="background: var(--surface);">
    <h2>Two things worth knowing</h2>
    <div class="grid">
      <div class="card">
        <h3>The brand is purple, not green</h3>
        <p>
          vayliron.com ships a teal-green default in its stylesheet, then overrides it inline with
          the real values — <code>#C947FF</code> on <code>#010134</code>. Reading only the
          stylesheet would have produced a confidently wrong palette.
        </p>
      </div>
      <div class="card">
        <h3>Attribution is a compile error</h3>
        <p>
          Every administrative write takes an actor argument, so a change nobody signed for will not
          type-check. Cancelling a run records who did it, why, and how many seats it released.
        </p>
      </div>
    </div>
  </section>

  <section class="band" style="background: var(--surface);">
    <h2>Before this carries real staff</h2>
    <ul class="plain">
      <li><b>Sign-in is a demo.</b> Email alone, no password or SSO. The session cookie is signed and
        <code>httpOnly</code>, so only the identity check needs replacing.</li>
      <li><b>The audit trail is append-only by convention, not enforcement.</b> Nothing in the app
        edits an entry, but a database user could. Move it off the box before it settles a dispute.</li>
      <li><b>Payments are arithmetic only.</b> Employers are invoiced and staff shares described as
        payroll deductions; there is no M-Pesa integration behind that.</li>
      <li><b>SQLite is single-node.</b> Correct under concurrency on one machine — the seat guards are
        partial unique indexes — but it will not survive being scaled out.</li>
      <li><b>Gilmer is licensed.</b> The brand face is declared first and falls back to a system stack
        rather than shipping a lookalike.</li>
    </ul>
  </section>

  <footer>
    Vayliron Mobility Ltd · Upper Hill, Nairobi · All times East Africa Time (UTC+3)
  </footer>
</div>

<script>
  // The station dot fills as its stage comes into view — the one piece of
  // motion on the page, and it echoes a bus passing a stage.
  const stops = document.querySelectorAll(".stop");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {{
    stops.forEach((s) => s.classList.add("is-here"));
  }} else {{
    const seen = new IntersectionObserver(
      (entries) => entries.forEach((e) => {{ if (e.isIntersecting) e.target.classList.add("is-here"); }}),
      {{ rootMargin: "-20% 0px -60% 0px" }}
    );
    stops.forEach((s) => seen.observe(s));
  }}
</script>
"""

OUT.write_text(HTML, encoding="utf-8")
size_mb = OUT.stat().st_size / 1024 / 1024
print(f"wrote {OUT} ({size_mb:.2f} MB)")
