@echo off
chcp 65001 >nul
echo ==============================================================
echo   短剧投流自动化运营中台 (Drama-FluxOps MVP) 一键启动
echo ==============================================================

echo [1/3] 检查 Python 后端依赖...
cd /d "%~dp0backend"
python -m pip install -r requirements.txt

echo [2/3] 检查前端 Node 依赖...
cd /d "%~dp0frontend"
if not exist "node_modules" (
    call npm install
)

echo [3/3] 启动后端 (127.0.0.1:8000) 与前端服务 (0.0.0.0:5173)...
start "FluxOps Backend (8000)" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"
start "FluxOps Frontend (5173)" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo ==============================================================
echo   本机访问地址:     http://127.0.0.1:5173
echo   公司局域网共享:   请查看前端窗口打印的 Network: http://192.168.x.x:5173
echo   内网穿透映射端口: 仅需映射本地 5173 端口即可 (已自动代理后端接口)
echo ==============================================================
