import os
from pathlib import Path
import pytest

@pytest.fixture
def direct_deploy(direct_deploy):
    return lambda *args, **kwargs: direct_deploy(*args, sdk_version='v0.2.16', **kwargs)

@pytest.fixture(autouse=True)
def windows_stdin_sharing_workaround(monkeypatch):
    if os.name != 'nt':
        yield
        return
    from gltest.direct import loader
    original = loader._inject_message_to_fd0
    deferred = []
    def inject(vm):
        try: original(vm)
        except PermissionError as error:
            if error.winerror != 32: raise
            deferred.append(Path(error.filename))
    monkeypatch.setattr(loader, '_inject_message_to_fd0', inject)
    yield
    for file in deferred:
        try: file.unlink(missing_ok=True)
        except PermissionError: pass
