from typing import Dict, Tuple, Optional, List, Any
import json
from .virtual_filesystem import SystemStore
from .terminal_emulator import Shell
from .tasks import REGISTRY, Objective


class TrainingEnv:
    
    def __init__(self, difficulty: str = "medium"):
        if difficulty not in REGISTRY:
            raise ValueError(f"Unknown difficulty: {difficulty}")
        
        self.difficulty = difficulty
        self.task = REGISTRY[difficulty]
        self.storage = SystemStore()
        self.terminal = Shell(self.storage)
        self.step_count = 0
        self.limit = 50
        self.finished = False
        self.score = 0.0
    
    def reset(self) -> Dict[str, Any]:
        self.storage.clear()
        self.terminal = Shell(self.storage)
        self.step_count = 0
        self.finished = False
        self.score = 0.0
        
        view = self._view()
        
        return {
            "observation": view,
            "info": {
                "task_name": self.task.nm,
                "difficulty": self.difficulty,
                "instructions": self.task.guide(),
                "max_steps": self.limit,
            }
        }
    
    def step(self, cmd: str) -> Dict[str, Any]:
        if self.finished:
            return {
                "observation": self._view(),
                "reward": 0.0,
                "done": True,
                "info": {"error": "Episode already complete. Call reset() first."}
            }
        
        self.step_count += 1
        
        out, code = self.terminal.run(cmd)
        
        penalty = -0.01
        
        done = self.step_count >= self.limit
        
        curr_score, task_info = self.task.eval(self.storage, self.terminal)
        
        if curr_score > self.score:
            bonus = (curr_score - self.score) * 0.5
            penalty += bonus
            self.score = curr_score
        
        if curr_score >= 1.0 and not done:
            penalty += 0.5
            done = True
            self.finished = True
        
        view = self._view()
        
        return {
            "observation": view,
            "reward": penalty,
            "done": done,
            "info": {
                "task_score": self.score,
                "command": cmd,
                "exit_code": code,
                "output_length": len(out),
                "step": self.step_count,
                "max_steps": self.limit,
                "task_metadata": task_info,
            }
        }
    
    def _view(self) -> Dict[str, Any]:
        pout, _ = self.terminal.run("ps")
        lout, _ = self.terminal.run("ls /home/user/scripts")
        
        return {
            "current_directory": self.terminal.cwd,
            "processes": pout,
            "filesystem": lout,
            "task_name": self.task.nm,
            "task_description": self.task.desc,
            "request": "Use commands to complete the task. Type your command below."
        }
    
    def dump(self) -> Dict:
        return {
            "filesystem": self.storage.snapshot(),
            "episode_step": self.step_count,
            "max_steps": self.limit,
            "task_score": self.score,
            "task_difficulty": self.difficulty,
            "command_history": self.terminal.history(),
        }
    
    @staticmethod
    def avail_tasks() -> List[str]:
        return list(REGISTRY.keys())
    
    @staticmethod
    def task_details(difficulty: str) -> Dict[str, Any]:
        if difficulty not in REGISTRY:
            return {}
        
        t = REGISTRY[difficulty]
        return {
            "name": t.nm,
            "difficulty": t.diff,
            "description": t.desc,
            "instructions": t.guide(),
        }
