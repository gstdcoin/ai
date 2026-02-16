"""GSTD A2A MCP Skill — pip install -e . for same behavior as clawhub install."""
from setuptools import setup, find_packages

setup(
    name="gstd-a2a",
    version="1.2.3",
    description="GSTD A2A MCP Skill — earn GSTD, hire compute, share knowledge",
    author="GSTD Foundation",
    packages=find_packages(where="python-sdk"),
    package_dir={"": "python-sdk"},
    install_requires=[
        "requests>=2.28.0",
        "mcp>=0.1.0",
        "pydantic>=2.0",
        "tonsdk>=1.0.12",
        "pynacl>=1.5.0",
    ],
    python_requires=">=3.9",
)
