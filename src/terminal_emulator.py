import re
from typing import Tuple, List
from .virtual_filesystem import SystemStore


class Shell:
    
    def __init__(self, storage: SystemStore):
        self.store = storage
        self.cwd = "/home/user"
        self.log = []
        self.ext = 0
    
    def run(self, text: str) -> Tuple[str, int]:
        self.log.append(text)
        text = text.strip()
        
        if not text:
            return "", 0
        
        tokens = self._tokenize(text)
        if not tokens:
            return "", 1
        
        op = tokens[0]
        args = tokens[1:]
        
        handlers = {
            "cat": self._cat,
            "ls": self._ls,
            "grep": self._grep,
            "chmod": self._chmod,
            "ps": self._ps,
            "kill": self._kill,
            "systemctl": self._systemctl,
            "pwd": self._pwd,
            "echo": self._echo,
            "test": self._test,
            "[": self._test,
        }
        
        if op in handlers:
            return handlers[op](args)
        else:
            return f"bash: command not found: {op}", 127
    
    def _tokenize(self, text: str) -> List[str]:
        tokens = []
        curr = ""
        quoted = False
        qchar = None
        
        for char in text:
            if char in ('"', "'") and not quoted:
                quoted = True
                qchar = char
            elif char == qchar and quoted:
                quoted = False
                qchar = None
            elif char == " " and not quoted:
                if curr:
                    tokens.append(curr)
                    curr = ""
            else:
                curr += char
        
        if curr:
            tokens.append(curr)
        
        return tokens
    
    def _resolve(self, path: str) -> str:
        if path.startswith("/"):
            return path
        if path == ".":
            return self.cwd
        if path == "..":
            parts = self.cwd.strip("/").split("/")
            return "/" + "/".join(parts[:-1]) if len(parts) > 1 else "/"
        return self.cwd.rstrip("/") + "/" + path
    
    def _cat(self, args: List[str]) -> Tuple[str, int]:
        if not args:
            return "Usage: cat <file>", 1
        
        result = []
        for arg in args:
            path = self._resolve(arg)
            ok, content = self.store.fetch(path)
            if not ok:
                return content, 1
            result.append(content.rstrip())
        
        return "\n".join(result), 0
    
    def _ls(self, args: List[str]) -> Tuple[str, int]:
        path = self._resolve(args[0] if args else ".")
        ok, items = self.store.entries(path)
        if not ok:
            return items, 1
        return "\n".join(items), 0
    
    def _grep(self, args: List[str]) -> Tuple[str, int]:
        if len(args) < 2:
            return "Usage: grep <pattern> <file>", 1
        
        pat = args[0]
        path = self._resolve(args[1])
        
        ok, content = self.store.fetch(path)
        if not ok:
            return content, 1
        
        try:
            regex = re.compile(pat)
        except re.error as e:
            return f"grep: invalid regex: {e}", 1
        
        matched = []
        for line in content.split("\n"):
            if regex.search(line):
                matched.append(line)
        
        if not matched:
            return "", 1
        
        return "\n".join(matched), 0
    
    def _chmod(self, args: List[str]) -> Tuple[str, int]:
        if len(args) < 2:
            return "Usage: chmod <mode> <file>", 1
        
        mode_txt = args[0]
        path = self._resolve(args[1])
        
        try:
            if mode_txt.startswith("0o") or mode_txt.startswith("0"):
                mode = int(mode_txt, 8)
            else:
                return f"chmod: invalid mode '{mode_txt}'", 1
        except ValueError:
            return f"chmod: invalid mode '{mode_txt}'", 1
        
        ok, err = self.store.chmod(path, mode)
        if not ok:
            return err, 1
        return "", 0
    
    def _ps(self, args: List[str]) -> Tuple[str, int]:
        out = ["PID\tNAME\t\tSTATUS"]
        for pname in sorted(self.store.svc_list()):
            ok, pinfo = self.store.svc_info(pname)
            if ok:
                pid = pinfo.get("pid", "?")
                stat = pinfo.get("status", "?").upper()
                out.append(f"{pid}\t{pname}\t\t{stat}")
        
        return "\n".join(out), 0
    
    def _kill(self, args: List[str]) -> Tuple[str, int]:
        if not args:
            return "Usage: kill <process_name>", 1
        
        pname = args[0]
        ok, err = self.store.svc_stop(pname)
        if not ok:
            return err, 1
        return "", 0
    
    def _systemctl(self, args: List[str]) -> Tuple[str, int]:
        if len(args) < 2:
            return "Usage: systemctl <start|stop|restart|status> <service>", 1
        
        act = args[0]
        svc = args[1]
        
        if act == "start":
            ok, err = self.store.svc_start(svc)
            if not ok:
                return err, 1
            return f"Started {svc}.", 0
        elif act == "stop":
            ok, err = self.store.svc_stop(svc)
            if not ok:
                return err, 1
            return f"Stopped {svc}.", 0
        elif act == "restart":
            self.store.svc_stop(svc)
            ok, err = self.store.svc_start(svc)
            if not ok:
                return err, 1
            return f"Restarted {svc}.", 0
        elif act == "status":
            ok, pinfo = self.store.svc_info(svc)
            if not ok:
                return f"Service '{svc}' not found", 1
            stat = pinfo.get("status", "unknown")
            return f"{svc} is {stat}", 0
        else:
            return f"Unknown action: {act}", 1
    
    def _pwd(self, args: List[str]) -> Tuple[str, int]:
        return self.cwd, 0
    
    def _echo(self, args: List[str]) -> Tuple[str, int]:
        return " ".join(args), 0
    
    def _test(self, args: List[str]) -> Tuple[str, int]:
        if len(args) < 3:
            return "", 1
        
        path = self._resolve(args[1])
        
        if args[0] == "-f":
            exists = self.store.exists(path)
            return "", 0 if exists else 1
        elif args[0] == "-x":
            ok, perms = self.store.perms(path)
            if not ok:
                return "", 1
            exe = bool(perms & 0o111)
            return "", 0 if exe else 1
        elif args[0] == "-d":
            exists = path in self.store.paths
            return "", 0 if exists else 1
        else:
            return f"test: unknown operator '{args[0]}'", 1
    
    def history(self) -> List[str]:
        return self.log.copy()
