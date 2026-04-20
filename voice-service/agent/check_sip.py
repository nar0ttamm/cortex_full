import inspect
from livekit import api

sip_svc = api.sip_service
print('sip_service module:', dir(sip_svc))
print()

# Check what's in api module
print('api module items with sip:', [x for x in dir(api) if 'sip' in x.lower() or 'trunk' in x.lower()])
print()

# Try SipClient
try:
    from livekit.api import SipClient
    print('SipClient methods:', [m for m in dir(SipClient) if not m.startswith('_')])
except Exception as e:
    print('SipClient error:', e)
