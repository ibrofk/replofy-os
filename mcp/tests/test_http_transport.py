from __future__ import annotations

import asyncio
import os
import signal
import socket
import subprocess
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastmcp import Client
from fastmcp.client.transports import PythonStdioTransport


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
MCP_DIRECTORY = REPOSITORY_ROOT / "mcp"


class ReplofyApiStubHandler(BaseHTTPRequestHandler):
    requests: list[tuple[str, str, str | None]] = []

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        parsed = urlparse(self.path)
        api_key = self.headers.get("x-api-key")
        self.__class__.requests.append((parsed.path, parsed.query, api_key))

        if parsed.path != "/api/v1/tasks":
            self.send_error(404, "Not found")
            return

        payload = b'{"data":[{"id":"task-http-1","title":"HTTP transport"}]}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, _format: str, *_args: object) -> None:
        return


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def _stop_process_tree(process: subprocess.Popen[str]) -> None:
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass

    try:
        process.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        if os.name == "nt":
            process.kill()
        else:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        process.communicate(timeout=10)

    if process.stderr is not None:
        process.stderr.close()


class ReplofyMcpHttpTransportTest(unittest.IsolatedAsyncioTestCase):
    async def test_http_client_dispatches_authenticated_api_request(self) -> None:
        ReplofyApiStubHandler.requests = []
        api_server = ThreadingHTTPServer(("127.0.0.1", 0), ReplofyApiStubHandler)
        api_thread = threading.Thread(target=api_server.serve_forever, daemon=True)
        api_thread.start()

        mcp_port = _free_port()
        environment = os.environ.copy()
        environment.update(
            {
                "REPLOFY_OS_BASE_URL": f"http://127.0.0.1:{api_server.server_port}",
                "REPLOFY_OS_API_KEY": "ros_http_transport_test",
                "REPLOFY_OS_TIMEOUT_SECONDS": "5",
                "REPLOFY_OS_CONTEXT_CACHE_SECONDS": "5",
            }
        )
        launcher = (
            "import sys; "
            f"sys.path.insert(0, {str(MCP_DIRECTORY)!r}); "
            "import replofy_os_mcp_server as server; "
            "server.mcp.run(transport='http', host='127.0.0.1', "
            "port=int(sys.argv[1]))"
        )
        process = subprocess.Popen(
            [sys.executable, "-c", launcher, str(mcp_port)],
            cwd=REPOSITORY_ROOT,
            env=environment,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            start_new_session=os.name != "nt",
        )

        try:
            deadline = asyncio.get_running_loop().time() + 90
            listening = False
            while asyncio.get_running_loop().time() < deadline:
                if process.poll() is not None:
                    stderr = process.stderr.read() if process.stderr else ""
                    raise AssertionError(
                        f"FastMCP HTTP server exited with {process.returncode}: {stderr[-2000:]}"
                    )

                try:
                    with socket.create_connection(("127.0.0.1", mcp_port), timeout=1):
                        listening = True
                    break
                except OSError:  # server startup is asynchronous
                    await asyncio.sleep(0.25)

            if not listening:
                self.fail("FastMCP HTTP server did not start listening within 90 seconds")

            async with Client(f"http://127.0.0.1:{mcp_port}/mcp") as client:
                result = await client.call_tool(
                    "replofy_request",
                    {
                        "method": "GET",
                        "path": "tasks",
                        "query": {"limit": 1},
                    },
                )

            self.assertIsNotNone(result)
            self.assertEqual(result.data["data"][0]["id"], "task-http-1")
            self.assertEqual(
                ReplofyApiStubHandler.requests,
                [("/api/v1/tasks", "limit=1", "ros_http_transport_test")],
            )
            self.assertEqual(
                parse_qs(ReplofyApiStubHandler.requests[0][1]),
                {"limit": ["1"]},
            )
        finally:
            api_server.shutdown()
            api_server.server_close()
            api_thread.join(timeout=5)
            _stop_process_tree(process)


class ReplofyMcpStdioTransportTest(unittest.IsolatedAsyncioTestCase):
    async def test_stdio_client_dispatches_authenticated_api_request(self) -> None:
        ReplofyApiStubHandler.requests = []
        api_server = ThreadingHTTPServer(("127.0.0.1", 0), ReplofyApiStubHandler)
        api_thread = threading.Thread(target=api_server.serve_forever, daemon=True)
        api_thread.start()

        environment = os.environ.copy()
        environment.update(
            {
                "REPLOFY_OS_BASE_URL": f"http://127.0.0.1:{api_server.server_port}",
                "REPLOFY_OS_API_KEY": "ros_stdio_transport_test",
                "REPLOFY_OS_TIMEOUT_SECONDS": "5",
                "REPLOFY_OS_CONTEXT_CACHE_SECONDS": "5",
            }
        )
        transport = PythonStdioTransport(
            script_path=MCP_DIRECTORY / "replofy_os_mcp_server.py",
            env=environment,
            cwd=str(REPOSITORY_ROOT),
            python_cmd=sys.executable,
            keep_alive=False,
        )

        try:
            async with Client(transport) as client:
                result = await client.call_tool(
                    "replofy_request",
                    {
                        "method": "GET",
                        "path": "tasks",
                        "query": {"limit": 1},
                    },
                )

            self.assertIsNotNone(result)
            self.assertEqual(result.data["data"][0]["id"], "task-http-1")
            self.assertEqual(
                ReplofyApiStubHandler.requests,
                [("/api/v1/tasks", "limit=1", "ros_stdio_transport_test")],
            )
            self.assertEqual(
                parse_qs(ReplofyApiStubHandler.requests[0][1]),
                {"limit": ["1"]},
            )
        finally:
            api_server.shutdown()
            api_server.server_close()
            api_thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
