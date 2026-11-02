"""Bounded scalar validation shared by HTTP and import writes."""
import math
from urllib.parse import urlsplit


class LocalOriginMiddleware:
    """A browser-origin boundary; local CLI clients may omit Origin.

    This is not authentication against software running as the same local user.
    """
    def __init__(self, app): self.app=app

    async def __call__(self, scope, receive, send):
        if scope['type']!='http':return await self.app(scope,receive,send)
        headers=dict(scope.get('headers',[]));origin=headers.get(b'origin');rejected=False
        if origin:
            try:
                supplied=urlsplit(origin.decode('ascii'))
                expected=urlsplit(scope.get('scheme','http')+'://'+headers.get(b'host',b'').decode('ascii'))
                rejected=(supplied.scheme,supplied.hostname,supplied.port or (443 if supplied.scheme=='https' else 80))!=(expected.scheme,expected.hostname,expected.port or (443 if expected.scheme=='https' else 80)) or bool(supplied.path or supplied.query or supplied.fragment or supplied.username)
            except (ValueError,UnicodeError):rejected=True
        if scope['method'] not in ('GET','HEAD','OPTIONS') and headers.get(b'sec-fetch-site')==b'cross-site':rejected=True
        if rejected:
            from starlette.responses import JSONResponse
            return await JSONResponse({'detail':'Cross-origin access is not allowed.','code':'origin_not_allowed'},status_code=403)(scope,receive,send)
        return await self.app(scope,receive,send)

def number(value, label, minimum=0, maximum=1e100):
    if isinstance(value, bool) or not isinstance(value, (str, int, float)):
        raise ValueError(f'{label} must be numeric.')
    try: result = float(value)
    except (ValueError, OverflowError): raise ValueError(f'{label} must be numeric.')
    if not math.isfinite(result) or not minimum <= result <= maximum:
        raise ValueError(f'{label} is outside its supported finite range.')
    return result

class BodyLimitMiddleware:
    """Count actual received bytes before parsing, including chunked uploads."""
    def __init__(self, app): self.app = app
    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or scope['method'] not in ('POST','PATCH','PUT'):
            return await self.app(scope, receive, send)
        limit = (64 if scope['path']=='/api/restore' else 10 if scope['path'].startswith('/api/import') else 1)*1024*1024
        body=bytearray(); size=0
        while True:
            message=await receive()
            if message['type']=='http.disconnect': return
            size+=len(message.get('body',b''))
            if size>limit:
                from starlette.responses import JSONResponse
                return await JSONResponse({'detail':'Request body is too large.', 'code':'body_too_large'},status_code=413)(scope,receive,send)
            body.extend(message.get('body',b''))
            if not message.get('more_body',False): break
        pending=True
        async def replay():
            nonlocal pending
            if pending:
                pending=False
                return {'type':'http.request','body':bytes(body),'more_body':False}
            return await receive()
        await self.app(scope,replay,send)
