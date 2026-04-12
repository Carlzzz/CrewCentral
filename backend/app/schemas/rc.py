from typing import Any


def rc_ok(data: Any = None, message: str = "返回成功") -> dict[str, Any]:
    return {"rc": 0, "message": message, "data": data}


def rc_err(message: str) -> dict[str, Any]:
    return {"rc": 1, "message": message}
