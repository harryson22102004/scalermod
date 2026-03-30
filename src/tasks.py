from typing import Dict, Tuple, Optional, Callable
from .virtual_filesystem import SystemStore
from .terminal_emulator import Shell


class Objective:
    
    def __init__(self, nm: str, diff: str, desc: str):
        self.nm = nm
        self.diff = diff
        self.desc = desc
        self.lvls = {}
        self.max_sc = 1.0
    
    def eval(self, fs: SystemStore, sh: Shell) -> Tuple[float, Dict]:
        raise NotImplementedError
    
    def guide(self) -> str:
        raise NotImplementedError


class LogSearchTask(Objective):
    
    def __init__(self):
        super().__init__(
            nm="Log Analysis",
            diff="easy",
            desc="Analyze application logs to find a critical error"
        )
        self.lvls = {
            1: "Log file accessed",
            2: "Error 500 found",
        }
        self.goal = "2026-03-30T09:22:19.234Z"
    
    def guide(self) -> str:
        return """
TASK: Log Analysis (Easy)

Your objective:
Find the timestamp of the first occurrence of "500 Internal Server Error" 
in the application log file.

Location: /var/log/app.log
Expected format: ISO 8601 timestamp at the start of the error line

Commands you might use:
- cat /var/log/app.log
- grep "500" /var/log/app.log

Return the exact timestamp when you find the error.
"""
    
    def eval(self, fs: SystemStore, sh: Shell) -> Tuple[float, Dict]:
        meta = {
            "task": "log_analysis",
            "stages_completed": [],
            "target_timestamp": self.goal,
            "commands_run": len(sh.log),
        }
        
        rec = sh.history()
        if any("app.log" in cmd for cmd in rec):
            meta["stages_completed"].append(1)
        
        for cmd in rec:
            if "grep" in cmd and "500" in cmd:
                out, code = sh.run(cmd)
                if code == 0 and "500" in out:
                    meta["stages_completed"].append(2)
                    if self.goal in out:
                        return 1.0, meta
        
        return 0.0, meta


class PermFixTask(Objective):
    
    def __init__(self):
        super().__init__(
            nm="Permission Repair",
            diff="medium",
            desc="Fix file permissions for a shell script"
        )
        self.lvls = {
            1: "Script located",
            2: "Permission check performed",
            3: "Script made executable",
        }
        self.tgt = "/home/user/scripts/cleanup.sh"
    
    def guide(self) -> str:
        return """
TASK: Permission Repair (Medium)

Your objective:
Make the cleanup.sh script executable so it can be run by the system.

Location: /home/user/scripts/cleanup.sh
Current permissions: 0644 (rw-r--r--)
Target permissions: 0755 (rwxr-xr-x) or similar with execute bit

Commands you might use:
- ls -l /home/user/scripts/cleanup.sh (to check permissions)
- chmod 0755 /home/user/scripts/cleanup.sh (to make executable)

Verify the script is executable after making changes.
"""
    
    def eval(self, fs: SystemStore, sh: Shell) -> Tuple[float, Dict]:
        meta = {
            "task": "permission_repair",
            "stages_completed": [],
            "script_path": self.tgt,
            "current_permissions": None,
            "is_executable": False,
        }
        
        rec = sh.history()
        if any("cleanup.sh" in cmd for cmd in rec):
            meta["stages_completed"].append(1)
        
        if any("chmod" in cmd or "ls" in cmd for cmd in rec):
            meta["stages_completed"].append(2)
        
        ok, perms = fs.perms(self.tgt)
        if ok:
            meta["current_permissions"] = oct(perms)
            exe = bool(perms & 0o111)
            meta["is_executable"] = exe
            
            if exe:
                meta["stages_completed"].append(3)
                return 1.0, meta
            else:
                if any("chmod" in cmd for cmd in rec):
                    return 0.5, meta
        
        return 0.0, meta


class ProcessRestoreTask(Objective):
    
    def __init__(self):
        super().__init__(
            nm="Process Recovery",
            diff="hard",
            desc="Diagnose and recover a failed service"
        )
        self.lvls = {
            1: "Process status checked",
            2: "Process verified dead",
            3: "Process restart attempted",
            4: "Process verified online",
        }
        self.target = "postgres"
    
    def guide(self) -> str:
        return """
TASK: Process Recovery (Hard)

Your objective:
The postgres database service has crashed. You need to:
1. Verify that postgres is not running (dead)
2. Clear/kill any zombie processes
3. Restart the postgres service
4. Verify that postgres is back online and running

Commands you might use:
- ps (to list all processes and their status)
- ps | grep postgres (to find postgres specifically)
- kill postgres (to terminate any remaining processes)
- systemctl restart postgres (to restart the service)
- systemctl status postgres (to verify it's online)

Monitor the process status throughout to confirm recovery.
"""
    
    def eval(self, fs: SystemStore, sh: Shell) -> Tuple[float, Dict]:
        meta = {
            "task": "process_recovery",
            "stages_completed": [],
            "target_process": self.target,
            "final_status": None,
            "recovery_steps": len(sh.log),
        }
        
        rec = sh.history()
        
        if any("ps" in cmd for cmd in rec):
            meta["stages_completed"].append(1)
        
        for i, cmd in enumerate(rec[:3]):
            if "ps" in cmd:
                meta["stages_completed"].append(2)
                break
        
        if any("systemctl restart" in cmd or "systemctl start" in cmd 
               for cmd in rec):
            meta["stages_completed"].append(3)
        
        ok, pinfo = fs.svc_info(self.target)
        if ok:
            stat = pinfo.get("status", "unknown")
            meta["final_status"] = stat
            
            if stat == "running":
                meta["stages_completed"].append(4)
                return 1.0, meta
            else:
                if 3 in meta["stages_completed"]:
                    return 0.5, meta
                else:
                    return 0.2, meta
        
        return 0.0, meta


REGISTRY = {
    "easy": LogSearchTask(),
    "medium": PermFixTask(),
    "hard": ProcessRestoreTask(),
}
