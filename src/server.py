from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any
import uvicorn

from .environment import TrainingEnv

app = FastAPI(
    title="Linux SRE Environment API",
    description="OpenEnv-compliant API for Linux System Reliability Engineer training environment",
    version="1.0.0"
)

backends: Dict[str, TrainingEnv] = {}
counter = 0


class ResetPayload(BaseModel):
    difficulty: str = Field(default="medium", description="Task difficulty: easy, medium, or hard")
    seed: Optional[int] = Field(default=None, description="Random seed for reproducibility")


class StepPayload(BaseModel):
    env_id: str = Field(description="Environment instance ID")
    action: str = Field(description="Shell command to execute")


class ResetOut(BaseModel):
    env_id: str
    observation: Dict[str, Any]
    info: Dict[str, Any]


class StepOut(BaseModel):
    observation: Dict[str, Any]
    reward: float
    done: bool
    info: Dict[str, Any]


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "linux-sre-env"}


@app.get("/api/v1/tasks")
async def list_tasks():
    return {
        "tasks": TrainingEnv.avail_tasks(),
        "details": {
            diff: TrainingEnv.task_details(diff)
            for diff in TrainingEnv.avail_tasks()
        }
    }


@app.get("/api/v1/tasks/{difficulty}")
async def get_task(difficulty: str):
    info = TrainingEnv.task_details(difficulty)
    if not info:
        raise HTTPException(status_code=404, detail=f"Task difficulty '{difficulty}' not found")
    return info


@app.post("/api/v1/env/reset")
async def reset(req: ResetPayload):
    global counter
    
    try:
        env = TrainingEnv(difficulty=req.difficulty)
        eid = f"env_{counter}"
        counter += 1
        
        backends[eid] = env
        res = env.reset()
        
        return ResetOut(
            env_id=eid,
            observation=res["observation"],
            info=res["info"]
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/v1/env/{env_id}/step")
async def step(env_id: str, req: StepPayload):
    if req.env_id not in backends:
        raise HTTPException(status_code=404, detail=f"Environment '{req.env_id}' not found")
    
    env = backends[req.env_id]
    res = env.step(req.action)
    
    return StepOut(
        observation=res["observation"],
        reward=res["reward"],
        done=res["done"],
        info=res["info"]
    )


@app.get("/api/v1/env/{env_id}/state")
async def get_state(env_id: str):
    if env_id not in backends:
        raise HTTPException(status_code=404, detail=f"Environment '{env_id}' not found")
    
    return backends[env_id].dump()


@app.delete("/api/v1/env/{env_id}")
async def delete_env(env_id: str):
    if env_id not in backends:
        raise HTTPException(status_code=404, detail=f"Environment '{env_id}' not found")
    
    del backends[env_id]
    return {"status": "deleted", "env_id": env_id}


@app.get("/api/v1/env")
async def list_envs():
    return {
        "count": len(backends),
        "env_ids": list(backends.keys())
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
