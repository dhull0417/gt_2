// The limit on answers to a meetup's custom RSVP questions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerTooLong, ANSWER_TOO_LONG, MAX_ANSWER_LENGTH } from './rsvpQuestions.js';

test('answers may be up to 70 characters', () => {
  assert.equal(MAX_ANSWER_LENGTH, 70);
  assert.equal(answerTooLong('x'.repeat(70)), false);
  assert.equal(answerTooLong('x'.repeat(71)), true);
});

test('a too-long answer is rejected with the user-facing message', () => {
  assert.equal(ANSWER_TOO_LONG, 'Answer must be 70 characters or less.');
});
