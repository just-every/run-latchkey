"""Runtime secrets through the explicitly installed Latchkey Node bridge."""
import json
import subprocess
import threading


class RuntimeRequestError(Exception):
    pass


def load_secrets(request, *, bridge_path, node="node", timeout=30):
    """Return approved string values; credentials travel only through pipes."""
    process = None
    workers = []
    try:
        payload = json.dumps(request, ensure_ascii=True).encode("utf-8")
        if len(payload) > 1_500_000 or not bridge_path or timeout <= 0:
            raise ValueError()
        process = subprocess.Popen(
            [node, str(bridge_path)], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=False,
        )
        output = []
        failures = []

        def read(stream, limit, retain=False):
            try:
                value = stream.read(limit + 1)
                if len(value) > limit:
                    failures.append(True)
                    process.kill()
                elif retain:
                    output.append(value)
            except Exception:
                failures.append(True)
            finally:
                stream.close()

        def write():
            try:
                process.stdin.write(payload)
            except Exception:
                failures.append(True)
            finally:
                process.stdin.close()

        workers = [threading.Thread(target=read, args=(process.stdout, 4_000_001, True)),
                   threading.Thread(target=read, args=(process.stderr, 4096)),
                   threading.Thread(target=write)]
        for worker in workers:
            worker.start()
        if process.wait(timeout=timeout) != 0:
            raise ValueError()
        for worker in workers:
            worker.join(timeout=timeout)
        if failures or any(worker.is_alive() for worker in workers) or len(output) != 1:
            raise ValueError()
        values = json.loads(output[0].decode("utf-8"))
        if not isinstance(values, dict) or any(not isinstance(value, str) for value in values.values()):
            raise ValueError()
        return values
    except Exception:
        raise RuntimeRequestError("runtime_request_failed") from None
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.wait()
        for worker in workers:
            worker.join(timeout=1)
