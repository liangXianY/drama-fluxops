@echo off
chcp 65001 >nul
echo ==============================================================
echo   短剧投流自动化运营中台 (ShortDrama FluxOps MVP) 一键启动
echo ==============================================================

echo [1/3] 检查并安装 Python 后端依赖...
cd /d "%~dp0backend"
python -m pip install -r requirements.txt

echo [2/3] 检查并安装前端 Node 依赖...
cd /d "%~dp0frontend"
if not exist "node_modules" (
    call npm install
)

echo [3/3] 启动前后端开发服务...
start "FluxOps Backend (8000)" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
start "FluxOps Frontend (5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo 启动成功！请在浏览器打开: http://127.0.0.1:5173
