import pytest


@pytest.fixture
def anyio_backend() -> str:
    # asyncio only — nothing in this app needs trio, and running the suite
    # twice per async test for no reason just slows it down.
    return "asyncio"
