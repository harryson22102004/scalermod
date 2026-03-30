import json
from typing import Dict, Any, Optional, List
from .environment import TrainingEnv


class AIWorker:
    
    def __init__(self, task_difficulty: str = "medium"):
        self.engine = TrainingEnv(task_difficulty=task_difficulty)
        self.recorder: List[Dict[str, Any]] = []
    
    def boot(self) -> Dict[str, Any]:
        reset_out = self.engine.reset()
        
        return {
            "status": "reset",
            "observation": reset_out["observation"],
            "task_name": reset_out["info"]["task_name"],
            "task_instructions": reset_out["info"]["instructions"],
            "max_steps": reset_out["info"]["max_steps"],
            "message": "Environment reset. Read the task instructions and begin solving."
        }
    
    def invoke(self, action: str, rationale: Optional[str] = None) -> Dict[str, Any]:
        step_out = self.engine.step(action)
        
        resp = {
            "status": "success" if step_out["info"]["exit_code"] == 0 else "failed",
            "command": action,
            "reward": step_out["reward"],
            "task_score": step_out["info"]["task_score"],
            "done": step_out["done"],
            "observation": step_out["observation"],
            "step": step_out["info"]["step"],
            "max_steps": step_out["info"]["max_steps"],
            "task_metadata": step_out["info"]["task_metadata"],
        }
        
        self.recorder.append({
            "command": action,
            "reasoning": rationale,
            "result": resp
        })
        
        if resp["done"]:
            resp["message"] = f"✓ Task completed! Final score: {resp['task_score']:.1f}"
        else:
            resp["message"] = f"Score: {resp['task_score']:.1f} | Steps: {resp['step']}/{resp['max_steps']}"
        
        return resp
    
    def context(self) -> str:
        state = self.engine.dump()
        
        ctx = f"""
LINUX SRE ENVIRONMENT STATE:

=== CURRENT TASK ===
Name: {self.engine.task.nm}
Difficulty: {self.engine.difficulty}
Description: {self.engine.task.desc}

=== PROGRESS ===
Task Score: {self.engine.score:.1f}
Steps Taken: {self.engine.step_count}
Max Steps: {self.engine.limit}

=== COMMAND HISTORY ===
{(chr(10).join(self.recorder[-5:]) if self.recorder else 'No commands executed yet')}

=== ENVIRONMENT STATE ===
Current Directory: {state['filesystem']['processes'].split(chr(10))[0] if state else 'Unknown'}

Commands executed: {len(self.engine.terminal.history())}
"""
        return ctx
    
    def report(self) -> Dict[str, Any]:
        return {
            "task_name": self.engine.task.nm,
            "difficulty": self.engine.difficulty,
            "final_score": self.engine.score,
            "steps_used": self.engine.step_count,
            "max_steps": self.engine.limit,
            "completed": self.engine.finished,
            "efficiency": self.engine.step_count / self.engine.limit if not self.engine.finished else 1.0,
            "command_history": self.engine.terminal.history(),
        }


class SystemPrompts:
    
    @staticmethod
    def get_sys(diff: str) -> str:
        context = {
            "easy": "This is a straightforward task suitable for learning basic Linux commands.",
            "medium": "This task requires understanding of file permissions and system permissions.",
            "hard": "This is a challenging task requiring troubleshooting and service management knowledge.",
        }
        
        return f"""You are a Linux System Reliability Engineer (SRE) agent with expertise in:
- System administration and troubleshooting
- Service management and process control
- Log analysis and debugging
- File system operations and permissions

Your task difficulty is: {diff}
{context.get(diff, '')}

When presented with a task:
1. Analyze the requirements carefully
2. Identify the key objective
3. Plan your approach with Linux commands
4. Execute commands systematically
5. Monitor progress toward task completion

For each step:
- Provide your reasoning for the command
- Execute relevant Linux commands
- Analyze the output
- Adjust your approach based on results

You have access to these commands:
- cat (read files)
- grep (search for patterns)
- ls (list directories)
- chmod (change permissions)
- ps (list processes)
- kill (terminate processes)
- systemctl (manage services)
- test (conditional tests)

Work efficiently and complete the task as quickly as possible."""
    
    @staticmethod
    def get_usr(iface: AIWorker) -> str:
        reset_out = iface.boot()
        
        return f"""CURRENT TASK:
{reset_out['task_instructions']}

CURRENT OBSERVATION:
- Current Directory: {reset_out['observation']['current_directory']}
- Processes Running:
{reset_out['observation']['processes']}

- Available Scripts:
{reset_out['observation']['filesystem']}

Please analyze this task and execute commands to complete it.
You have {reset_out['max_steps']} steps to complete this task.

Start by determining what needs to be done, then execute appropriate commands."""


def demo():
    
    agent = AIWorker(task_difficulty="medium")
    
    initial = agent.boot()
    print("Initial observation:", initial["observation"]["filesystem"])

    commands = [
        "ls -la /home/user/scripts/cleanup.sh",
        "chmod 0755 /home/user/scripts/cleanup.sh",
    ]
    
    for cmd in commands:
        result = agent.execute_command(cmd, agent_reasoning="Checking and fixing permissions")
        print(f"Command: {cmd}")
        print(f"Result: {'Success' if result['status'] == 'success' else 'Failed'}")
        print(f"Task Score: {result['task_score']}")
        print()
    
    summary = agent.report()
    print("Episode Summary:")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    create_agent_example()
