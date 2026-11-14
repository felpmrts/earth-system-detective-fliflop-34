"""Utilitários compartilhados por todos os conectores de API em `data/connectors/`."""

from __future__ import annotations

import math
import os
import socket
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

DATA_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_USER_AGENT = "TrendDetective-NASASpaceApps/1.0"

_ORIG_GETADDRINFO = socket.getaddrinfo


def _ipv4_preferred_getaddrinfo(*args: Any, **kwargs: Any) -> list[Any]:
    """Prioriza endereços IPv4 (AF_INET) para evitar timeouts/WinError 10013 em IPv6."""
    results = _ORIG_GETADDRINFO(*args, **kwargs)
    ipv4 = [entry for entry in results if entry[0] == socket.AF_INET]
    return ipv4 or results


if socket.getaddrinfo is not _ipv4_preferred_getaddrinfo:
    socket.getaddrinfo = _ipv4_preferred_getaddrinfo


def load_env_file(env_path: Path | None = None) -> None:
    """Carrega `data/.env` sem sobrescrever variáveis já exportadas no ambiente."""
    target = env_path or (DATA_ROOT / ".env")
    if not target.is_file():
        return
    for raw_line in target.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and val and key not in os.environ:
            os.environ[key] = val


load_env_file()


def snap_merra2(lat: float, lon: float) -> tuple[float, float]:
    """Arredonda (lat, lon) para o centro da grade MERRA-2 (0.5° lat × 0.625° lon)."""
    return round(round(lat / 0.5) * 0.5, 4), round(round(lon / 0.625) * 0.625, 4)


def snap_ceres(lat: float, lon: float) -> tuple[float, float]:
    """Arredonda (lat, lon) para o centro da grade CERES (1.0° × 1.0°, centros em .5)."""
    return round(math.floor(lat) + 0.5, 4), round(math.floor(lon) + 0.5, 4)


def clean_fill_value(raw_value: Any, fill_threshold: float = -990.0) -> float | None:
    """Converte sentinelas como `-999` em `None` sem alterar zeros físicos reais."""
    if raw_value is None:
        return None
    try:
        val = float(raw_value)
    except (TypeError, ValueError):
        return None
    if math.isnan(val) or math.isinf(val) or val <= fill_threshold:
        return None
    return val


def log_api_pull(label: str, api_name: str, endpoint: str, variables_desc: str) -> None:
    """Exibe no terminal qual API e variável estão sendo consultadas."""
    print(f">>> PUXANDO API [{label}]: {api_name} | Endpoint: {endpoint} | Variável(is): {variables_desc}")


class _NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _build_opener(follow_redirects: bool, bypass_proxy: bool) -> urllib.request.OpenerDirector:
    handlers: list[Any] = []
    if bypass_proxy:
        handlers.append(urllib.request.ProxyHandler({}))
    if not follow_redirects:
        handlers.append(_NoRedirectHandler())
    return urllib.request.build_opener(*handlers)


def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    timeout: int = 30,
    follow_redirects: bool = True,
) -> dict[str, Any]:
    """Executa requisição HTTP/HTTPS usando stdlib e retorna dicionário padronizado."""
    merged_headers = {"User-Agent": DEFAULT_USER_AGENT}
    if headers:
        merged_headers.update(headers)
    req = urllib.request.Request(url, method=method, headers=merged_headers)
    t0 = time.monotonic()

    for bypass_proxy in (False, True):
        opener = _build_opener(follow_redirects=follow_redirects, bypass_proxy=bypass_proxy)
        try:
            with opener.open(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                return {
                    "ok": True,
                    "status_code": resp.status,
                    "elapsed_s": round(time.monotonic() - t0, 3),
                    "headers": dict(resp.headers.items()),
                    "body": body,
                    "error": None,
                }
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
            return {
                "ok": False,
                "status_code": exc.code,
                "elapsed_s": round(time.monotonic() - t0, 3),
                "headers": dict(exc.headers.items()) if exc.headers else {},
                "body": body,
                "error": f"HTTP {exc.code}: {exc.reason}",
            }
        except urllib.error.URLError as exc:
            if not bypass_proxy:
                continue
            return {
                "ok": False,
                "status_code": None,
                "elapsed_s": round(time.monotonic() - t0, 3),
                "headers": {},
                "body": "",
                "error": str(exc),
            }
        except Exception as exc:  # noqa: BLE001
            return {
                "ok": False,
                "status_code": None,
                "elapsed_s": round(time.monotonic() - t0, 3),
                "headers": {},
                "body": "",
                "error": str(exc),
            }

    return {
        "ok": False,
        "status_code": None,
        "elapsed_s": round(time.monotonic() - t0, 3),
        "headers": {},
        "body": "",
        "error": "Falha desconhecida ao executar requisição HTTP.",
    }
