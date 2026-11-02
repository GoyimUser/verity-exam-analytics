"""One offline Chromium renderer for examination and study documents."""
import os
from pathlib import Path


class BrowserUnavailable(RuntimeError):
    pass


def render_pdf(html):
    from playwright.sync_api import sync_playwright, Error
    with sync_playwright() as p:
        options={'headless':True}
        if not Path(p.chromium.executable_path).exists():options['channel']='msedge' if os.name=='nt' else 'chrome'
        try:
            browser=p.chromium.launch(**options)
        except Error as exc:
            if 'executable' in str(exc).lower() and any(v in str(exc).lower() for v in ('exist','not found','distribution')):
                raise BrowserUnavailable('PDF browser is not installed.') from exc
            raise
        try:
            page=browser.new_page();page.route('**/*',lambda route:route.abort())
            page.set_content(html,wait_until='load');page.evaluate('document.fonts.ready')
            return page.pdf(format='A4',print_background=True,margin={'top':'15mm','bottom':'16mm','left':'17mm','right':'17mm'},display_header_footer=True,header_template='<span></span>',footer_template='<div style="font-size:9px;width:100%;text-align:center;color:#61727a">Verity · <span class="pageNumber"></span> / <span class="totalPages"></span></div>')
        finally:browser.close()
