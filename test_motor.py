#!/usr/bin/env python3
"""Direct RPC motor test - slow move for multimeter measurement"""
import socket
import msgpack
import time

sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
sock.connect("/var/run/arduino-router.sock")
sock.settimeout(60)
time.sleep(0.3)

print("=== Motor Pin Test ===")
print("Moving Motor 1 (X-axis, D2=pulse, D3=dir)")
print("1000 steps, direction=1 (CW), delay=10000us (10ms/step)")
print("Total time: ~20 seconds")
print("Measure D2 with multimeter NOW - should toggle 0V/3.3V")
print()

req = msgpack.packb([0, 1, "move", [1, 1000, 1, 10000]])
sock.sendall(req)
data = sock.recv(4096)
resp = msgpack.unpackb(data, raw=False)
print(f"Result: {resp}")
print(f"Steps executed: {resp[3] if len(resp) > 3 else 'unknown'}")

sock.close()
print("Done")
