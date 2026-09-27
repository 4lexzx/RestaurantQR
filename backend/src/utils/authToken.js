const crypto = require('crypto');

const processSecret = process.env.AUTH_SECRET || crypto.randomBytes(48).toString('hex');
const TOKEN_TTL_SECONDS = Number(process.env.AUTH_TOKEN_TTL_SECONDS || 8 * 60 * 60);

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(payload) {
  const body = encode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  }));
  const signature = crypto.createHmac('sha256', processSecret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verify(token) {
  if (!token || typeof token !== 'string') return null;
  const [body, signature, extra] = token.split('.');
  if (!body || !signature || extra) return null;
  const expected = crypto.createHmac('sha256', processSecret).update(body).digest();
  let received;
  try { received = Buffer.from(signature, 'base64url'); } catch (_) { return null; }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

module.exports = { sign, verify };
