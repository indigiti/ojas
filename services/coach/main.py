"""Optional deterministic coach baseline. No provider keys or external calls."""
import os
import secrets
from typing import Literal

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)

class Request(BaseModel):
    model_config = ConfigDict(extra="forbid")
    focus: Literal["full", "upper", "lower"]

@app.post("/routine-drafts")
def draft(request: Request, authorization: str = Header(default="")):
    token = os.getenv("OJAS_COACH_TOKEN", "")
    if len(token) < 32 or not secrets.compare_digest(authorization.encode(), ("Bearer " + token).encode()):
        raise HTTPException(status_code=401)
    plans = {
        "full": ("Full Body Draft", ["squat", "bench", "row"]),
        "upper": ("Upper Body Draft", ["bench", "row", "press"]),
        "lower": ("Lower Body Draft", ["squat", "deadlift", "split"]),
    }
    name, exercises = plans[request.focus]
    return {"name": name, "exercises": exercises, "source": "template"}
