import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduleEndBoundary, endDateProblem, END_BEFORE_START } from './scheduleEndDate.js';

test('no end date means no boundary', () => {
  assert.equal(scheduleEndBoundary({ endDate: null }, 'America/Denver'), null);
  assert.equal(scheduleEndBoundary({}, 'America/Denver'), null);
});

test('the boundary is the last moment of the end date in the group timezone', () => {
  const b = scheduleEndBoundary({ endDate: new Date('2027-03-15T00:00:00Z') }, 'America/Denver');
  assert.equal(b.toISO(), '2027-03-15T23:59:59.999-06:00');
});

const day = (iso) => new Date(iso + 'T00:00:00Z');
const MSG = "End date can't be before the start date.";

test('the validation message is the agreed wording', () => {
  assert.equal(END_BEFORE_START, MSG);
});

test('no end date is always fine', () => {
  assert.equal(endDateProblem({ endDate: null, startDate: day('2027-03-01') }), null);
});

test('an end date on the start date is fine (inclusive)', () => {
  assert.equal(endDateProblem({ endDate: day('2027-03-01'), startDate: day('2027-03-01') }), null);
});

test('an end date before the start date is rejected', () => {
  assert.equal(endDateProblem({ endDate: day('2027-02-28'), startDate: day('2027-03-01') }), MSG);
});

test('biweekly / yearly rows use their own first date when the schedule has none', () => {
  const routines = [{ frequency: 'biweekly', dayTimes: [{ day: 2, time: '06:00 PM', startDate: day('2027-04-06') }] }];
  assert.equal(endDateProblem({ endDate: day('2027-04-01'), startDate: null, routines }), MSG);
  assert.equal(endDateProblem({ endDate: day('2027-04-06'), startDate: null, routines }), null);
});

test('ISO strings from the request body are accepted', () => {
  assert.equal(endDateProblem({ endDate: '2027-02-28', startDate: '2027-03-01' }), MSG);
});
