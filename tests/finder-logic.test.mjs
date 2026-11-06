// M Grand Minori ver2, Option 9 port (6 Nov 2026). Run: node --test tests/finder-logic.test.mjs
// Expected values are the outputs _finder.js produces at MGM's calculator defaults (90% loan, 35 years, 4.0% p.a., S$ 3.11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const F = createRequire(import.meta.url)('../_finder.js');

const run = (household, bracket, must) => F.match({ household, bracket, must: must || {} });
const line = (r) => [r.best.id, r.bestTag, r.runner.id, F.runnerBadge(r.runner)].join(' | ');

test('monthly instalments, RM (4.0%, 90%, 35 years): A 1,323 · B 1,578 · C 2,004 · D 2,064 · E 2,606', () => {
  const got = F.UNITS.map(u => u.id + ':' + F.monthly(u.price)).join(' ');
  assert.equal(got, 'A:1323 B:1578 C:2004 D:2064 E:2606');
});
test('monthly instalments, S$ (3.11, from the unrounded figure): A 425 · B 507 · C 645 · D 664 · E 838', () => {
  const got = F.UNITS.map(u => u.id + ':' + F.monthlySgd(u.price)).join(' ');
  assert.equal(got, 'A:425 B:507 C:645 D:664 E:838');
});
test('the four brackets separate the types (A | A,B | A,B,C,D | all)', () => {
  const within = (b) => F.evaluate({ bracket: b }).filter(u => u.within).map(u => u.id).join('');
  assert.equal(within('b1'), 'A');
  assert.equal(within('b2'), 'AB');
  assert.equal(within('b3'), 'ABCD');
  assert.equal(within('b4'), 'ABCDE');
});
test('just me, Under RM 1,500 -> A best; B is a stretch', () => {
  assert.equal(line(run('me', 'b1')), 'A | best | B | WORTH A STRETCH');
});
test('couple, RM 1,500-1,800 -> B best (the studio is too small); C is a stretch', () => {
  const r = run('couple', 'b2');
  assert.equal(line(r), 'B | best | C | WORTH A STRETCH');
  assert.equal(F.evaluate({ household: 'couple', bracket: 'b2' })[0].issue, 'Needs a separate bedroom');
});
test('split (live in one side, rent out the other), RM 1,800-2,500 -> C best; alternative D, CLOSEST ALTERNATIVE (Aurora rule: a within-budget alternative ranks ahead of the over-budget E)', () => {
  const r = run('split', 'b3');
  assert.equal(line(r), 'C | best | D | CLOSEST ALTERNATIVE');
  assert.equal(r.units.filter(u => u.id === 'D')[0].issue, 'Not a dual-key layout');
  assert.equal(F.diffLine(r.best, r.runner), 'RM 60/mo more, 6 sq ft bigger');
});
test('split, Above RM 2,500 -> E best (most space), C also fits', () => {
  assert.equal(line(run('split', 'b4')), 'E | best | C | ALSO FITS YOU');
});
test('family, Under RM 1,500 -> E, tagged closest_above_budget (only E has 3 bedrooms)', () => {
  const r = run('family', 'b1');
  assert.equal(line(r), 'E | closest_above_budget | A | CLOSEST ALTERNATIVE');
  assert.equal(r.best.over, 2606 - 1500);
});
test('buying to rent out + private yard -> B (the only yard), in budget or not', () => {
  assert.equal(line(run('invest', 'b2', { yard: true })), 'B | best | A | CLOSEST ALTERNATIVE');
  assert.equal(line(run('invest', 'b1', { yard: true })), 'B | closest_above_budget | A | CLOSEST ALTERNATIVE');
});
test('walk-in closet matches D only (E has fitted wardrobes)', () => {
  const ids = F.evaluate({ household: 'me', bracket: 'b4', must: { walkin: true } }).filter(u => u.fits).map(u => u.id).join('');
  assert.equal(ids, 'D');
});
test('2 bathrooms matches E only (C is 1 bathroom + 1 powder room, shown "1+1")', () => {
  const ids = F.evaluate({ household: 'me', bracket: 'b4', must: { bath2: true } }).filter(u => u.fits).map(u => u.id).join('');
  assert.equal(ids, 'E');
  assert.equal(F.unit('C').bathLabel, '1+1');
});
test('dual-key must-have matches C and E; high floor changes nothing', () => {
  const dk = F.evaluate({ household: 'me', bracket: 'b4', must: { dualkey: true } }).filter(u => u.fits).map(u => u.id).join('');
  assert.equal(dk, 'CE');
  const hi = F.evaluate({ household: 'me', bracket: 'b4', must: { high: true } }).filter(u => u.fits).length;
  assert.equal(hi, 5);
});
test('finder string and chips go with the lead', () => {
  const a = { household: 'couple', bracket: 'b3', must: { yard: true, bath2: true } };
  assert.equal(F.finderString(a), 'Couple | RM 1,800–2,500 | Private yard, 2 bathrooms');
  assert.deepEqual(F.answerLabels(a).chips, ['Couple', 'RM 1,800–2,500', 'Private yard', '2 bathrooms']);
});
