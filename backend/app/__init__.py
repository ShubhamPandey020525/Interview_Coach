# Pure-python fallback for xxhash if C-extension DLL is blocked by Windows OS security policy
import hashlib
import sys
import types

try:
    import xxhash
except Exception:

    class DummyHashObj:
        def __init__(self, data: bytes = b"") -> None:
            self._data = data

        def hexdigest(self) -> str:
            return hashlib.md5(self._data).hexdigest()

        def digest(self) -> bytes:
            return hashlib.md5(self._data).digest()

    def _h128(data: bytes | str = b"", *args: object, **kwargs: object) -> str:
        raw = data.encode("utf-8") if isinstance(data, str) else bytes(data or b"")
        return hashlib.md5(raw).hexdigest()

    def _h64(data: bytes | str = b"", *args: object, **kwargs: object) -> str:
        raw = data.encode("utf-8") if isinstance(data, str) else bytes(data or b"")
        return hashlib.md5(raw).hexdigest()[:16]

    m = types.ModuleType("xxhash")
    setattr(m, "xxh3_128_hexdigest", _h128)
    setattr(m, "xxh3_64_hexdigest", _h64)
    setattr(m, "xxh64_hexdigest", _h64)
    setattr(m, "xxh32_hexdigest", _h64)
    setattr(m, "xxh64", lambda data=b"", *args, **kwargs: DummyHashObj(data if isinstance(data, bytes) else str(data).encode("utf-8")))
    setattr(m, "xxh3_64", getattr(m, "xxh64"))
    setattr(m, "xxh128", getattr(m, "xxh64"))
    setattr(m, "xxh3_128", getattr(m, "xxh64"))
    sys.modules["xxhash"] = m
