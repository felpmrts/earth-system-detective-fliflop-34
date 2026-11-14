#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Space Apps · Mission Control - Servidor de Sincronização em Tempo Real (LAN / Wi-Fi)
Biblioteca Padrão do Python 3 (Sem dependências externas: pip, npm, etc.)
"""

import http.server
import socketserver
import json
import os
import socket
import threading
import time
import urllib.parse
import sys
import queue

DEFAULT_PORT = 8765

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.path.join(BASE_DIR, "mission_control_state.json")
HTML_FILE = os.path.join(BASE_DIR, "Space Apps · Mission Control Lite (1).html")

subscribers = set()
subscribers_lock = threading.Lock()


def get_lan_ip():
    """Detecta automaticamente o IP local na rede Wi-Fi / LAN conectada."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Conexão dummy UDP não envia pacotes pela rede, apenas obtém o IP da interface de saída
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    except Exception:
        ip = "127.0.0.1"
    finally:
        s.close()
    return ip


def broadcast_state(json_str):
    """Envia o novo estado a todos os clientes SSE conectados."""
    with subscribers_lock:
        targets = list(subscribers)
    for q in targets:
        try:
            q.put_nowait(json_str)
        except Exception:
            pass


class SyncHandler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/", "/index.html"):
            if not os.path.exists(HTML_FILE):
                self.send_error(404, f"Arquivo HTML não encontrado em: {HTML_FILE}")
                return
            try:
                with open(HTML_FILE, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_error(500, f"Erro ao servir HTML: {e}")

        elif path == "/api/state":
            if os.path.exists(STATE_FILE):
                try:
                    with open(STATE_FILE, "rb") as f:
                        data = f.read()
                except Exception as e:
                    data = json.dumps({"empty": True, "error": str(e)}).encode("utf-8")
            else:
                data = b'{"empty": true}'

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(data)))
            self.send_cors_headers()
            self.end_headers()
            self.wfile.write(data)

        elif path == "/api/events":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_cors_headers()
            self.end_headers()

            client_queue = queue.Queue(maxsize=200)
            with subscribers_lock:
                subscribers.add(client_queue)

            try:
                # Comentário inicial de conexão SSE
                self.wfile.write(b": connected\n\n")
                self.wfile.flush()

                while True:
                    try:
                        msg = client_queue.get(timeout=15)
                        # Formata Server-Sent Event
                        sse_payload = f"data: {msg}\n\n".encode("utf-8")
                        self.wfile.write(sse_payload)
                        self.wfile.flush()
                    except queue.Empty:
                        # Keep-alive periódico a cada 15 segundos
                        self.wfile.write(b": keepalive\n\n")
                        self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                pass
            except Exception:
                pass
            finally:
                with subscribers_lock:
                    subscribers.discard(client_queue)

        else:
            self.send_error(404, "Endpoint não encontrado")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == "/api/state":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length <= 0:
                    raise ValueError("Corpo da requisição vazio")

                post_body = self.rfile.read(content_length)
                raw_str = post_body.decode("utf-8")
                data = json.loads(raw_str)

                # Salva atomicamente via arquivo temporário + os.replace
                tmp_path = STATE_FILE + ".tmp"
                with open(tmp_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                os.replace(tmp_path, STATE_FILE)

                # Transmite instantaneamente para todos os navegadores conectados via SSE
                broadcast_state(raw_str)

                resp = b'{"ok": true}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(resp)))
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(resp)
            except Exception as e:
                err_resp = json.dumps({"ok": False, "error": str(e)}).encode("utf-8")
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(err_resp)))
                self.send_cors_headers()
                self.end_headers()
                self.wfile.write(err_resp)
        else:
            self.send_error(404, "Endpoint não encontrado")

    def log_message(self, fmt, *args):
        # Log limpo no terminal com hora e ação
        sys.stderr.write(f"[{time.strftime('%H:%M:%S')}] {args[0]} {args[1]} {args[2]}\n")


class ThreadedHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    port = DEFAULT_PORT
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print(f"Porta inválida '{sys.argv[1]}', usando {DEFAULT_PORT}.")

    lan_ip = get_lan_ip()
    server_address = ("0.0.0.0", port)

    try:
        httpd = ThreadedHTTPServer(server_address, SyncHandler)
    except Exception as e:
        print(f"Erro ao vincular à porta {port}: {e}")
        sys.exit(1)

    banner = f"""
========================================================================
🚀 Space Apps · Mission Control - Servidor de Sincronização LAN (Wi-Fi)
========================================================================
📡 Servidor ativo e pronto para sincronizar a equipe em tempo real!

▶ No computador HOST (esta máquina):
  http://localhost:{port}

▶ Nos computadores da equipe (mesma rede Wi-Fi / LAN):
  http://{lan_ip}:{port}

✦ As alterações salvas por qualquer membro são transmitidas em tempo real
✦ Suporta acesso via arquivo local (CORS liberado para file://)
✦ Pressione Ctrl+C para encerrar o servidor.
========================================================================
"""
    print(banner)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n🛑 Encerrando servidor de sincronização...")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
