"""Privacy controls and evidence.

* ``install_network_guard`` patches ``socket.connect`` so this process cannot
  open an outbound connection to any non-loopback address (enabled by default;
  set TEKME_NETWORK_GUARD=0 to disable). Inbound connections to the local
  API are unaffected because servers *accept*, they do not *connect*.
* ``status`` reports local model files, the guard state, any blocked attempts
  and the live list of this process's non-loopback sockets (via psutil).

This is a software-level safeguard and an observable test - not a
cryptographic proof. See docs/PRIVACY.md for the full verification procedure.
"""
from __future__ import annotations

import hashlib
import ipaddress
import os
import socket
import threading
from pathlib import Path

from backend.core import config

_lock = threading.Lock()
_state = {"installed": False, "blocked_attempts": 0, "last_blocked": None}
_original_connect = socket.socket.connect
_original_connect_ex = socket.socket.connect_ex


def _is_local(address) -> bool:
    try:
        host = address[0] if isinstance(address, tuple) else address
    except Exception:
        return True
    if isinstance(host, (bytes, bytearray)):
        host = host.decode(errors="ignore")
    if not isinstance(host, str):
        return True  # AF_UNIX paths etc.
    if host in ("localhost", ""):
        return True
    try:
        ip = ipaddress.ip_address(host.split("%")[0])
    except ValueError:
        return False  # an unresolved hostname -> external by definition
    return ip.is_loopback


class OutboundBlocked(ConnectionRefusedError):
    pass


def _guarded_connect(self, address):
    if self.family in (socket.AF_INET, socket.AF_INET6) and not _is_local(address):
        with _lock:
            _state["blocked_attempts"] += 1
            _state["last_blocked"] = str(address[0]) if isinstance(address, tuple) else "?"
        raise OutboundBlocked(f"TEKME network guard blocked outbound connection to {address!r}")
    return _original_connect(self, address)


def _guarded_connect_ex(self, address):
    if self.family in (socket.AF_INET, socket.AF_INET6) and not _is_local(address):
        with _lock:
            _state["blocked_attempts"] += 1
            _state["last_blocked"] = str(address[0]) if isinstance(address, tuple) else "?"
        return 111  # ECONNREFUSED
    return _original_connect_ex(self, address)


def install_network_guard() -> bool:
    if os.environ.get("TEKME_NETWORK_GUARD", "1") == "0":
        return False
    with _lock:
        if not _state["installed"]:
            socket.socket.connect = _guarded_connect
            socket.socket.connect_ex = _guarded_connect_ex
            _state["installed"] = True
    return True


def uninstall_network_guard() -> None:
    with _lock:
        socket.socket.connect = _original_connect
        socket.socket.connect_ex = _original_connect_ex
        _state["installed"] = False


def guard_state() -> dict:
    with _lock:
        return dict(_state)


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


_hash_cache: dict[str, tuple[float, str]] = {}


def model_files() -> list[dict]:
    files = []
    for p in [config.MODEL_BUNDLE, config.ARTIFACTS / "vocab.txt", config.BACKEND_DATA / "official_domains.json"]:
        if p.exists():
            st = p.stat()
            cached = _hash_cache.get(str(p))
            if not cached or cached[0] != st.st_mtime:
                cached = (st.st_mtime, _sha256(p))
                _hash_cache[str(p)] = cached
            files.append({"name": p.name, "path": str(p.relative_to(config.ROOT)), "size_bytes": st.st_size,
                          "sha256": cached[1], "present": True})
        else:
            files.append({"name": p.name, "path": str(p), "present": False})
    return files


def external_connections() -> list[dict]:
    """Non-loopback sockets currently held by this process (live observation)."""
    try:
        import psutil
    except ImportError:
        return [{"error": "psutil not installed"}]
    out = []
    try:
        for c in psutil.Process().net_connections(kind="inet"):
            if c.raddr and not _is_local((c.raddr.ip, c.raddr.port)):
                out.append({"remote": f"{c.raddr.ip}:{c.raddr.port}", "status": c.status})
    except Exception as e:  # access denied on some platforms
        return [{"error": type(e).__name__}]
    return out


def status(model_loaded: bool) -> dict:
    g = guard_state()
    ext = external_connections()
    files = model_files()
    return {
        "inference_location": "local (this computer)",
        "model_loaded": model_loaded,
        "model_files": files,
        "all_model_files_local": all(f.get("present") for f in files),
        "network_guard": {"active": g["installed"], "blocked_outbound_attempts": g["blocked_attempts"],
                          "last_blocked_host": g["last_blocked"]},
        "live_external_connections": ext,
        "no_external_connections_now": not any("remote" in c for c in ext),
        "server_bind_host": config.HOST,
        "bound_to_loopback": config.HOST in ("127.0.0.1", "localhost", "::1"),
        "cors_allowed_origins": config.CORS_ORIGINS,
        "raw_message_logging": config.LOG_MESSAGES,
        "message_storage": "none - messages are processed in memory and discarded",
        "third_party_services": [],
        "limitations": ("The guard and connection list cover this backend process. Browser-side requests are "
                        "limited by the bundled frontend, which loads no remote assets; run the offline test in "
                        "docs/PRIVACY.md with Wi-Fi disabled for end-to-end evidence."),
    }
