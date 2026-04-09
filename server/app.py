"""OpenEnv server entry point for python_module deployment mode."""
import uvicorn
from src.server import app  # noqa: F401


def main():
    uvicorn.run(app, host="0.0.0.0", port=7860, workers=1)


if __name__ == "__main__":
    main()
