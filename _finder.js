/*
 * M Grand Minori ver2 · Option 9 port (6 Nov 2026): layout finder + compare logic.
 * Framework-free. The ONE source of unit data, instalment maths, budget brackets and matching for the
 * quiz, the Compare all 5 section and the sticky bar. Nothing else on the page carries these numbers.
 * Ported from M Aurora's _finder.js (live 5 Nov 2026, bef1867); the ranking (evaluate / match / runner / badges)
 * is Aurora's, unit data, loan terms, questions and brackets are MGM's own.
 *
 * Instalment terms = MGM's own calculator defaults: 90% loan, 35 years, 4.0% p.a. (the page footer says the same).
 * S$ at 1 SGD = 3.11 MYR, the calculator's rate, on the unrounded instalment (as the calculator did).
 *
 *   Monthly (RM, rounded)           A 1,323 · B 1,578 · C 2,004 · D 2,064 · E 2,606
 *   Monthly (SGD, from unrounded)   A 425 · B 507 · C 645 · D 664 · E 838
 *   Brackets (Justin approved 6 Nov, each separates the types; C and D are only RM 60 apart so they share one):
 *     b1 Under RM 1,500 -> A    b2 RM 1,500-1,800 -> A, B    b3 RM 1,800-2,500 -> A, B, C, D    b4 Above RM 2,500 -> all
 *     (a bracket is an upper limit, so "within" is cumulative: the narrowest bracket that holds a type is its own)
 *
 * Settled facts (checked against the page copy, the floor plans and the e-brochure pp. 6 to 7, 6 Nov 2026):
 *   E has fitted wardrobes, not a walk-in closet, so walk-in is D only. C is 1 bathroom + 1 powder room (brochure):
 *   it shows "1+1" as the page does, but counts as 1 bathroom, so "2 bathrooms" matches E only.
 * Two small additions to Aurora's rules, both needed by MGM's data and neither touching the ranking:
 *   - a household can require a feature (Q1 "Live in one side, rent out the other" requires a dual-key layout);
 *   - with no household answered yet, a unit needs 0 bedrooms (Aurora's default of 1 was written for a 1+1 entry unit).
 *
 *   var r = MAFinder.match({ household: 'split', bracket: 'b3', must: {} });
 *   r.best.id -> 'C'   r.runner.id -> 'D' (CLOSEST ALTERNATIVE, "Not a dual-key layout")   r.bestTag -> 'best'
 *
 * Tests: node --test tests/finder-logic.test.mjs
 */
(function (root) {
  'use strict';

  // ---- Unit data (the page's own UNITS table and floor plans; prices are the live card's) ----
  // beds = bedrooms for matching (0 = studio). bath = bathrooms for matching; C has 1 bath + 1 powder room, shown "1+1".
  var UNITS = [
    { id: 'A', bed: 'Studio', beds: 0, bath: 1, bathLabel: '1',   sqft: 403, price: 332000, dualKey: false, yard: false, walkIn: false, plan: 'assets/fp-type-a-card.webp' },
    { id: 'B', bed: '1 bed',  beds: 1, bath: 1, bathLabel: '1',   sqft: 496, price: 396000, dualKey: false, yard: true,  walkIn: false, plan: 'assets/fp-type-b-card.webp' },
    { id: 'C', bed: '1 bed',  beds: 1, bath: 1, bathLabel: '1+1', sqft: 624, price: 503000, dualKey: true,  yard: false, walkIn: false, plan: 'assets/fp-type-c-card.webp' },
    { id: 'D', bed: '1 bed',  beds: 1, bath: 1, bathLabel: '1',   sqft: 630, price: 518000, dualKey: false, yard: false, walkIn: true,  plan: 'assets/fp-type-d-card.webp' },
    { id: 'E', bed: '3 bed',  beds: 3, bath: 2, bathLabel: '2',   sqft: 835, price: 654000, dualKey: true,  yard: false, walkIn: false, plan: 'assets/fp-type-e-card.webp' }
  ];

  // ---- Loan assumptions: the same as the calculator this section replaced ----
  var LOAN = { margin: 0.9, years: 35, rate: 0.04, sgd: 3.11 };

  function monthlyRaw(price) {
    var r = LOAN.rate / 12, n = LOAN.years * 12, p = price * LOAN.margin;
    return p * r / (1 - Math.pow(1 + r, -n));
  }
  function monthly(price) { return Math.round(monthlyRaw(price)); }
  function monthlySgd(price) { return Math.round(monthlyRaw(price) / LOAN.sgd); }

  function fmt(n) { return Math.round(n).toLocaleString('en-MY'); }

  // ---- Quiz options ----
  var HOUSEHOLD = [
    { key: 'me',     label: 'Just me',                                 minBeds: 0 },
    { key: 'couple', label: 'Couple',                                  minBeds: 1, tooSmall: 'Needs a separate bedroom' },
    { key: 'family', label: 'Family with kids',                        minBeds: 3, tooSmall: 'Too small for a family' },
    { key: 'invest', label: 'Buying to rent out',                      minBeds: 0 },
    { key: 'split',  label: 'Live in one side, rent out the other',    minBeds: 0, requires: 'dualKey', requiresIssue: 'Not a dual-key layout' }
  ];
  // Cut-offs chosen so each bracket separates the types. Re-check if LOAN changes.
  var BRACKETS = [
    { key: 'b1', label: 'Under RM 1,500',  max: 1500 },
    { key: 'b2', label: 'RM 1,500–1,800',  max: 1800 },
    { key: 'b3', label: 'RM 1,800–2,500',  max: 2500 },
    { key: 'b4', label: 'Above RM 2,500',  max: Infinity }
  ];
  // high floor is passed to sales only; it does not change the match.
  var MUST = [
    { key: 'dualkey', label: 'Dual-key layout',   affectsMatch: true },
    { key: 'yard',    label: 'Private yard',      affectsMatch: true },
    { key: 'walkin',  label: 'Walk-in closet',    affectsMatch: true },
    { key: 'bath2',   label: '2 bathrooms',       affectsMatch: true },
    { key: 'high',    label: 'High floor',        affectsMatch: false }
  ];

  function find(list, key) { for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i]; return null; }
  function rooms(u) { return u.beds; }
  function unit(id) { for (var i = 0; i < UNITS.length; i++) if (UNITS[i].id === id) return UNITS[i]; return null; }
  // display helpers (the page's own wording: "Studio", "1 bed", dual-key where the unit is one)
  function bedText(u) { return u.bed + (u.dualKey ? ' dual-key' : ''); }
  function specText(u) { return bedText(u) + ' · ' + u.bathLabel + ' bath · ' + fmt(u.sqft) + ' sq ft'; }

  function evaluate(answers) {
    answers = answers || {};
    var hh = find(HOUSEHOLD, answers.household);
    var br = find(BRACKETS, answers.bracket);
    var must = answers.must || {};
    var need = hh ? hh.minBeds : 0;
    var max = br ? br.max : Infinity;
    return UNITS.map(function (u) {
      var m = monthly(u.price), issues = [];
      if (rooms(u) < need) issues.push(hh.tooSmall || ('Too small for ' + hh.label.toLowerCase()));
      else if (hh && hh.requires && !u[hh.requires]) issues.push(hh.requiresIssue);
      else {
        if (must.dualkey && !u.dualKey) issues.push('Not a dual-key layout');
        if (must.yard && !u.yard) issues.push('No private yard');
        if (must.walkin && !u.walkIn) issues.push('No walk-in closet');
        if (must.bath2 && u.bath < 2) issues.push('Only 1 bathroom');
      }
      var out = {};
      for (var k in u) if (u.hasOwnProperty(k)) out[k] = u[k];
      out.monthly = m; out.monthlySgd = monthlySgd(u.price); out.within = m <= max; out.over = out.within ? 0 : m - max;
      out.fits = issues.length === 0; out.issue = issues.join(' · ');
      return out;
    });
  }

  function match(answers) {
    var units = evaluate(answers);
    var hh = find(HOUSEHOLD, answers.household), need = hh ? hh.minBeds : 0;
    var bySqDesc = function (a, b) { return b.sqft - a.sqft; };
    var byMonthlyAsc = function (a, b) { return a.monthly - b.monthly; };

    var fitWithin = units.filter(function (u) { return u.fits && u.within; }).sort(bySqDesc);
    var fitOver = units.filter(function (u) { return u.fits && !u.within; }).sort(byMonthlyAsc);
    var best, tag;
    if (fitWithin.length) { best = fitWithin[0]; tag = 'best'; }                 // most space inside budget
    else if (fitOver.length) { best = fitOver[0]; tag = 'closest_above_budget'; } // cheapest that fits needs
    else { best = units.filter(function (u) { return u.within; }).sort(function (a, b) { return b.beds - a.beds; })[0] || units[0]; tag = 'closest'; }

    var pool = units.filter(function (u) { return u.id !== best.id; });
    var runner = pool.filter(function (u) { return u.fits && u.within; }).sort(bySqDesc)[0]
      || pool.filter(function (u) { return u.within && rooms(u) >= need; }).sort(bySqDesc)[0]
      || pool.filter(function (u) { return u.fits; }).sort(byMonthlyAsc)[0]
      || pool.filter(function (u) { return u.within; }).sort(bySqDesc)[0]
      || pool[0];

    return { best: best, bestTag: tag, runner: runner, runnerFits: runner.fits, units: units };
  }

  // "RM 57/mo less, 1 fewer bathroom"
  function diffLine(best, other) {
    var bits = [], dm = other.monthly - best.monthly, db = other.bath - best.bath;
    if (dm !== 0) bits.push('RM ' + fmt(Math.abs(dm)) + '/mo ' + (dm < 0 ? 'less' : 'more'));
    if (db !== 0) bits.push(Math.abs(db) + ' ' + (db < 0 ? 'fewer' : 'more') + ' bathroom' + (Math.abs(db) > 1 ? 's' : ''));
    else if (other.sqft !== best.sqft) bits.push(fmt(Math.abs(other.sqft - best.sqft)) + ' sq ft ' + (other.sqft < best.sqft ? 'smaller' : 'bigger'));
    return bits.join(', ');
  }

  // Badge copy: the alternative card
  function runnerBadge(runner) {
    if (runner.fits && runner.within) return 'ALSO FITS YOU';
    if (runner.fits) return 'WORTH A STRETCH';
    return 'CLOSEST ALTERNATIVE';
  }
  function bestBadge(tag) {
    return tag === 'best' ? 'YOUR BEST MATCH' : (tag === 'closest_above_budget' ? 'CLOSEST MATCH · ABOVE YOUR RANGE' : 'CLOSEST MATCH');
  }
  // one-line reason under the best-match card
  function bestReason(best, answers) {
    var br = find(BRACKETS, (answers || {}).bracket), must = (answers || {}).must || {};
    var s = best.within ? 'Most space within your ' + (br ? br.label : 'budget') + ' range' : 'Most affordable layout that fits your needs';
    var asked = [];
    if (must.dualkey && best.dualKey) asked.push('the dual-key layout');
    if (must.yard && best.yard) asked.push('a private yard');
    if (must.walkin && best.walkIn) asked.push('a walk-in closet');
    if (must.bath2 && best.bath >= 2) asked.push('the 2 bathrooms');
    return s + (asked.length ? ', with ' + asked.join(' and ') + ' you asked for.' : '.');
  }
  // answer chips for the finder bar, and the string that goes with the lead
  function answerLabels(answers) {
    answers = answers || {};
    var hh = find(HOUSEHOLD, answers.household), br = find(BRACKETS, answers.bracket), must = answers.must || {};
    var m = MUST.filter(function (x) { return must[x.key]; }).map(function (x) { return x.label; });
    return { household: hh ? hh.label : '', bracket: br ? br.label : '', must: m,
      chips: [hh ? hh.label : '', br ? br.label : ''].concat(m).filter(Boolean) };
  }
  function finderString(answers) {
    var a = answerLabels(answers);
    return [a.household, a.bracket, a.must.join(', ')].filter(Boolean).join(' | ');
  }

  root.MAFinder = { UNITS: UNITS, LOAN: LOAN, HOUSEHOLD: HOUSEHOLD, BRACKETS: BRACKETS, MUST: MUST,
    monthly: monthly, monthlySgd: monthlySgd, fmt: fmt, unit: unit, find: find, evaluate: evaluate, match: match, diffLine: diffLine,
    bedText: bedText, specText: specText,
    runnerBadge: runnerBadge, bestBadge: bestBadge, bestReason: bestReason, answerLabels: answerLabels, finderString: finderString };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.MAFinder;
})(typeof window !== 'undefined' ? window : globalThis);
