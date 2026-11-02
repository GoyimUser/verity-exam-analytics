import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from starlette.testclient import TestClient
from desktop import DesktopSession, data_directory, lock_data


class DesktopTests(unittest.TestCase):
    def test_profile_is_outside_executable(self):
        with patch.dict(os.environ,{'LOCALAPPDATA':str(Path(tempfile.gettempdir())/'test-profile')}):
            self.assertEqual(data_directory(),Path(tempfile.gettempdir())/'test-profile'/'Verity')
        with tempfile.TemporaryDirectory() as temporary:
            self.assertEqual(data_directory(temporary),Path(temporary).resolve())

    def test_session_cookie_and_origin_boundary(self):
        async def home(request):return JSONResponse({'ok':True})
        app=DesktopSession(Starlette(routes=[Route('/',home),Route('/api',home,methods=['GET','POST'])]),'example-token','http://127.0.0.1:8765')
        with TestClient(app,base_url='http://127.0.0.1:8765') as client:
            self.assertEqual(client.get('/api').status_code,403)
            self.assertEqual(client.get('/?session=wrong').status_code,403)
            response=client.get('/?session=example-token')
            self.assertEqual(response.status_code,200)
            self.assertIn('HttpOnly',response.headers['set-cookie'])
            self.assertEqual(client.get('/api').status_code,200)
            self.assertEqual(client.post('/api',headers={'origin':'https://other.example'}).status_code,403)
            self.assertEqual(client.get('/api',headers={'host':'other.example'}).status_code,403)
            self.assertEqual(client.post('/api',headers={'origin':'http://127.0.0.1:8765'}).status_code,200)

    @unittest.skipUnless(os.name=='nt','Windows file locking')
    def test_one_process_per_profile(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory=Path(temporary)
            first=lock_data(directory)
            try:
                with self.assertRaises(RuntimeError):lock_data(directory)
            finally:first.close()
            second=lock_data(directory);second.close()
