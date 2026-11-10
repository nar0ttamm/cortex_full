/**
 * Channel consent. Opt-out and suppression always block.
 * A missing grant blocks only when the tenant or environment requires it.
 * Unknown consent stays allowed so existing leads are not silently dropped.
 */

const CHANNELS = ['call', 'email', 'whatsapp'];

function normalizeAddress(channel, value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (channel === 'email') return raw;
  return raw.replace(/[^\d+]/g, '');
}

function readConsent(lead) {
  if (!lead) return {};
  if (lead.channel_consent && typeof lead.channel_consent === 'object') return lead.channel_consent;
  const meta = lead.metadata?.channel_consent;
  return meta && typeof meta === 'object' ? meta : {};
}

function channelDecision({ channel, consent, suppressed = false, requireGrant = false }) {
  if (!CHANNELS.includes(channel)) return { allowed: false, reason: 'unknown_channel' };
  if (suppressed) return { allowed: false, reason: 'suppressed' };
  const value = consent?.[channel];
  if (value === 'denied' || value === false || value === 'opted_out') {
    return { allowed: false, reason: 'opted_out' };
  }
  if (requireGrant && value !== 'granted' && value !== true) {
    return { allowed: false, reason: 'consent_required' };
  }
  return { allowed: true, reason: value === 'granted' || value === true ? 'granted' : 'unknown' };
}

function requireGrantFromSettings(settings, channel, env = process.env) {
  const envKey = `REQUIRE_${String(channel || '').toUpperCase()}_CONSENT`;
  if (env[envKey] === 'true') return true;
  return settings?.[`require_${channel}_consent`] === true;
}

module.exports = {
  CHANNELS,
  normalizeAddress,
  readConsent,
  channelDecision,
  requireGrantFromSettings,
};
