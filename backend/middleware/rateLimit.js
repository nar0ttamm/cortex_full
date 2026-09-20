const buckets = new Map();

function rateLimit({ windowMs, max, keyFn }) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const recent = (buckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Too many requests. Please retry shortly.' });
    }
    recent.push(now);
    buckets.set(key, recent);
    return next();
  };
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) return fwd.split(',')[0].trim();
  return req.ip || 'unknown';
}

module.exports = { rateLimit, clientIp };
