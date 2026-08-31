import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiKey, CliError } from '../src/config.js';

describe('cli helpers', () => {
  const previous = process.env.CALLIRRA_API_KEY;

  before(() => {
    process.env.CALLIRRA_API_KEY = 'sk-cal-test-key';
  });

  after(() => {
    if (previous === undefined) delete process.env.CALLIRRA_API_KEY;
    else process.env.CALLIRRA_API_KEY = previous;
  });

  it('resolves api key from environment', async () => {
    assert.equal(await resolveApiKey(), 'sk-cal-test-key');
  });

  it('rejects malformed api key', async () => {
    await assert.rejects(resolveApiKey('bad-key'), CliError);
  });

  it('carries optional status on CliError', () => {
    const err = new CliError('nope', 401);
    assert.equal(err.status, 401);
  });
});
