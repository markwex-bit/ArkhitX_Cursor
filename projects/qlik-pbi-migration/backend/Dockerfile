FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
# /sdk is bind-mounted at runtime — install arkhitx-sdk on each start, then run uvicorn
CMD ["sh", "-c", "if [ -d /sdk ]; then pip install -q -e /sdk; fi && exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
