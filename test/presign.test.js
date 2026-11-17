import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explain, presign } from '../lib/presign.js';
import { locate, open, parse } from '../src/s3.js';

// The worked example from the Amazon S3 documentation, "Authenticating
// Requests: Using Query Parameters (AWS Signature Version 4)". The keys
// are AWS's published sample keys, not real ones.
test('presign matches the AWS documentation example', () => {
  const url = presign({
    bucket: 'examplebucket',
    key: 'test.txt',
    region: 'us-east-1',
    host: 'examplebucket.s3.amazonaws.com',
    expires: 86400,
    now: new Date('2013-05-24T00:00:00Z'),
    credentials: {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    },
  });
  assert.equal(
    url,
    'https://examplebucket.s3.amazonaws.com/test.txt' +
      '?X-Amz-Algorithm=AWS4-HMAC-SHA256' +
      '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
      '&X-Amz-Date=20130524T000000Z' +
      '&X-Amz-Expires=86400' +
      '&X-Amz-SignedHeaders=host' +
      '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
  );
});

test('presign carries a session token and encodes the key', () => {
  const url = new URL(
    presign({
      bucket: 'takes',
      key: 'day 1/kick (final).wav',
      region: 'eu-west-1',
      credentials: { accessKeyId: 'A', secretAccessKey: 'B', sessionToken: 'tok/en+1' },
    }),
  );
  assert.equal(url.host, 'takes.s3.eu-west-1.amazonaws.com');
  assert.equal(url.pathname, '/day%201/kick%20%28final%29.wav');
  assert.equal(url.searchParams.get('X-Amz-Security-Token'), 'tok/en+1');
  assert.match(url.searchParams.get('X-Amz-Signature'), /^[0-9a-f]{64}$/);
});

test('S3 addresses parse, and bad ones are refused', () => {
  assert.deepEqual(parse('s3://takes/day 1/kick.wav'), { bucket: 'takes', key: 'day 1/kick.wav' });
  assert.equal(open(parse('s3://takes/day 1/kick.wav')), 'https://takes.s3.amazonaws.com/day%201/kick.wav');
  assert.equal(open(parse('s3://my.takes/kick.wav')), 'https://s3.amazonaws.com/my.takes/kick.wav');
  for (const bad of ['s3://takes', 's3://takes/', 's3://Bad_Bucket/a.wav', 's3://evil.com:80/a.wav', 'https://x/y.wav']) {
    assert.throws(() => parse(bad), bad);
  }
});

test('ARNs parse like s3:// addresses', () => {
  assert.deepEqual(parse('arn:aws:s3:::takes/day 1/kick.wav'), { bucket: 'takes', key: 'day 1/kick.wav' });
});

test('pasted S3 web addresses are recognised', () => {
  const kick = { bucket: 'takes', key: 'day 1/kick.wav' };
  for (const address of [
    'https://takes.s3.amazonaws.com/day+1/kick.wav',
    'https://takes.s3.us-west-2.amazonaws.com/day%201/kick.wav',
    'https://takes.s3-us-west-2.amazonaws.com/day%201/kick.wav',
    'https://s3.us-west-2.amazonaws.com/takes/day%201/kick.wav',
    'https://s3.amazonaws.com/takes/day%201/kick.wav',
    'https://us-west-2.console.aws.amazon.com/s3/object/takes?region=us-west-2&prefix=day+1/kick.wav',
    'https://s3.console.aws.amazon.com/s3/object/takes?region=us-west-2&prefix=day%201%2Fkick.wav',
  ]) {
    assert.deepEqual(locate(address), kick, address);
  }
  for (const address of [
    'https://example.com/day/kick.wav',
    'https://takes.s3.amazonaws.com/kick.wav?X-Amz-Signature=abc',
    'https://takes.s3.amazonaws.com/',
    'https://us-west-2.console.aws.amazon.com/s3/buckets/takes',
    's3://takes/kick.wav',
    'not an address',
  ]) {
    assert.equal(locate(address), null, address);
  }
});

test('S3 refusals are put in words', () => {
  const kick = { bucket: 'takes', key: 'kick.wav' };
  assert.match(explain('AccessDenied', 'Access Denied', kick), /s3:GetObject/);
  assert.match(explain('NoSuchKey', '', kick), /no "kick.wav" in bucket takes/);
  assert.match(explain('ExpiredToken', '', kick), /aws sso login/);
  assert.match(explain('SlowDown', 'Reduce your request rate', kick), /SlowDown \(Reduce your request rate\)/);
});
