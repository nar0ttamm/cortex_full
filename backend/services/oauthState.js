const crypto = require('crypto');

function signState(payload) {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error('ENCRYPTION_KEY is required to sign OAuth state');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60 * 1000 })).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readState(state) {
  const key = process.env.ENCRYPTION_KEY;
  const [body, sig] = String(state || '').split('.');
  if (!key || !body || !sig) return null;
  const expected = crypto.createHmac('sha256', key).update(body).digest('base64url');
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!decoded.exp || decoded.exp < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}

module.exports = { signState, readState };
